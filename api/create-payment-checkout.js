export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const stripeKey=process.env.STRIPE_SECRET_KEY;
  const supabaseUrl=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing=[['STRIPE_SECRET_KEY',stripeKey],['SUPABASE_URL',supabaseUrl],['SUPABASE_SERVICE_ROLE_KEY',serviceKey]].filter(x=>!x[1]).map(x=>x[0]);
  if(missing.length)return res.status(503).json({error:`Server setup missing: ${missing.join(', ')}`});

  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  if(!token)return res.status(401).json({error:'Please sign in again.'});

  // Verify the customer's Supabase access token without requiring @supabase/supabase-js.
  const userResp=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{apikey:serviceKey,Authorization:`Bearer ${token}`}});
  const user=await userResp.json().catch(()=>null);
  if(!userResp.ok||!user?.id)return res.status(401).json({error:'Your login session expired. Please sign in again.'});

  const id=req.body?.payment_request_id;
  if(!id)return res.status(400).json({error:'Payment request ID is missing.'});

  const q=new URLSearchParams({id:`eq.${id}`,customer_id:`eq.${user.id}`,select:'*'});
  const payResp=await fetch(`${supabaseUrl}/rest/v1/payment_requests?${q}`,{headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`}});
  const rows=await payResp.json().catch(()=>[]);
  if(!payResp.ok)return res.status(500).json({error:rows?.message||'Could not load the payment request.'});
  const p=rows?.[0];
  if(!p)return res.status(404).json({error:'Payment request was not found for this account.'});
  if(p.status==='paid')return res.status(409).json({error:'This payment has already been completed.'});
  if(p.status!=='pending')return res.status(409).json({error:`This payment cannot be paid because its status is ${p.status}.`});

  const cents=Math.round(Number(p.amount)*100);
  if(!Number.isFinite(cents)||cents<50)return res.status(400).json({error:'The payment amount is invalid.'});

  // Stripe Checkout accepts dynamic price_data, so no Stripe Product is required.
  const origin='https://nexusequipmentrentals.com';
  const form=new URLSearchParams();
  form.set('mode','payment');
  if(user.email)form.set('customer_email',user.email);
  form.set('line_items[0][price_data][currency]','usd');
  form.set('line_items[0][price_data][product_data][name]',p.title||'Nexus Equipment Rentals Payment');
  if(p.note)form.set('line_items[0][price_data][product_data][description]',String(p.note).slice(0,500));
  form.set('line_items[0][price_data][unit_amount]',String(cents));
  form.set('line_items[0][quantity]','1');
  form.set('success_url',`${origin}/portal.html?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url',`${origin}/portal.html?payment=cancelled`);
  form.set('metadata[payment_request_id]',p.id);
  form.set('metadata[customer_id]',user.id);
  form.set('metadata[rental_request_id]',p.rental_request_id||'');
  form.set('payment_intent_data[metadata][payment_request_id]',p.id);
  form.set('payment_intent_data[metadata][customer_id]',user.id);
  form.set('payment_intent_data[metadata][rental_request_id]',p.rental_request_id||'');

  const stripeResp=await fetch('https://api.stripe.com/v1/checkout/sessions',{
   method:'POST',
   headers:{Authorization:`Bearer ${stripeKey}`,'Content-Type':'application/x-www-form-urlencoded'},
   body:form.toString()
  });
  const session=await stripeResp.json().catch(()=>({}));
  if(!stripeResp.ok)return res.status(stripeResp.status>=500?502:400).json({error:`Stripe: ${session?.error?.message||'Could not create checkout.'}`});
  if(!session?.url)return res.status(502).json({error:'Stripe created a session but did not return a checkout URL.'});

  await fetch(`${supabaseUrl}/rest/v1/payment_requests?id=eq.${encodeURIComponent(p.id)}`,{
   method:'PATCH',
   headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',Prefer:'return=minimal'},
   body:JSON.stringify({stripe_checkout_session_id:session.id})
  });

  return res.status(200).json({ok:true,url:session.url});
 }catch(e){
  console.error('checkout fatal:',e);
  return res.status(500).json({error:e?.message||'Could not create Stripe Checkout.'});
 }
}