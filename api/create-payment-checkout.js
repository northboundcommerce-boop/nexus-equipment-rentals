import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data:{user},error:ue}=await admin.auth.getUser(token);if(ue||!user)return res.status(401).json({error:'Please sign in again.'});
  const {data:p,error}=await admin.from('payment_requests').select('*').eq('id',req.body.payment_request_id).eq('customer_id',user.id).eq('status','pending').single();
  if(error||!p)return res.status(404).json({error:'Payment request not found.'});
  const session=await stripe.checkout.sessions.create({mode:'payment',customer_email:user.email,line_items:[{price_data:{currency:'usd',product_data:{name:p.title,description:p.note||'Nexus Equipment Rentals payment'},unit_amount:Math.round(Number(p.amount)*100)},quantity:1}],success_url:`${req.headers.origin}/portal.html?payment=success`,cancel_url:`${req.headers.origin}/portal.html?payment=cancelled`,metadata:{payment_request_id:p.id,customer_id:user.id}});
  await admin.from('payment_requests').update({stripe_checkout_session_id:session.id}).eq('id',p.id);
  return res.status(200).json({url:session.url});
 }catch(e){return res.status(500).json({error:e.message||'Checkout failed.'})}
}