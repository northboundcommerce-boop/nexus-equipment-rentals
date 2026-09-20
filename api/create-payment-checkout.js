import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const missing=['STRIPE_SECRET_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].filter(k=>!process.env[k]);
  if(missing.length)return res.status(503).json({error:`Server setup missing: ${missing.join(', ')}`});

  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  if(!token)return res.status(401).json({error:'Please sign in again.'});

  const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return res.status(401).json({error:'Your login session expired. Please sign in again.'});

  const id=req.body?.payment_request_id;
  if(!id)return res.status(400).json({error:'Payment request ID is missing.'});

  const {data:p,error:payError}=await admin.from('payment_requests').select('*').eq('id',id).eq('customer_id',user.id).single();
  if(payError||!p)return res.status(404).json({error:'Payment request was not found for this account.'});
  if(p.status==='paid')return res.status(409).json({error:'This payment has already been completed.'});
  if(p.status!=='pending')return res.status(409).json({error:`This payment cannot be paid because its status is ${p.status}.`});

  const amount=Math.round(Number(p.amount)*100);
  if(!Number.isFinite(amount)||amount<50)return res.status(400).json({error:'The payment amount is invalid.'});

  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin=`${req.headers['x-forwarded-proto']||'https'}://${req.headers['x-forwarded-host']||req.headers.host||'nexusequipmentrentals.com'}`;
  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   customer_email:user.email,
   line_items:[{price_data:{currency:'usd',product_data:{name:p.title||'Nexus Equipment Rentals Payment',description:p.note||'Rental payment'},unit_amount:amount},quantity:1}],
   success_url:`${origin}/portal.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
   cancel_url:`${origin}/portal.html?payment=cancelled`,
   metadata:{payment_request_id:p.id,customer_id:user.id,rental_request_id:p.rental_request_id||''},
   payment_intent_data:{metadata:{payment_request_id:p.id,customer_id:user.id,rental_request_id:p.rental_request_id||''}}
  });

  const {error:updateError}=await admin.from('payment_requests').update({stripe_checkout_session_id:session.id}).eq('id',p.id);
  if(updateError)console.error('Could not save checkout session:',updateError);
  if(!session.url)return res.status(500).json({error:'Stripe created a session but did not return a checkout URL.'});
  return res.status(200).json({ok:true,url:session.url});
 }catch(e){
  console.error('create-payment-checkout:',e);
  const message=e?.type?.startsWith?.('Stripe')?`Stripe: ${e.message}`:(e.message||'Could not create Stripe Checkout.');
  return res.status(500).json({error:message});
 }
}