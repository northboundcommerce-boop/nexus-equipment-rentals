import { createClient } from '@supabase/supabase-js';

function serverClient(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase server configuration is incomplete.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function requireAdmin(req,sb){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token) throw Object.assign(new Error('Unauthorized.'),{status:401});
  const {data:{user},error}=await sb.auth.getUser(token);
  if(error||!user) throw Object.assign(new Error('Unauthorized.'),{status:401});
  const {data,error:adminError}=await sb.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminError) throw adminError;
  if(!data) throw Object.assign(new Error('Administrator access required.'),{status:403});
  return user;
}
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
  try{
    const sb=serverClient();
    await requireAdmin(req,sb);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'').trim().toLowerCase();
    const paymentId=String(body.payment_id||'').trim();
    if(!paymentId) return res.status(400).json({error:'Payment ID is required.'});
    if(!['cancel','remove'].includes(action)) return res.status(400).json({error:'Invalid payment action.'});
    const {data:payment,error:findError}=await sb.from('payment_requests').select('id,status,stripe_checkout_session_id,stripe_payment_intent_id').eq('id',paymentId).maybeSingle();
    if(findError) throw findError;
    if(!payment) return res.status(404).json({error:'Payment request not found.'});
    if(payment.status==='paid') return res.status(409).json({error:'Paid payments cannot be cancelled or removed. Keep them for payment history.'});
    if(action==='cancel'){
      if(['cancelled','failed'].includes(payment.status)) return res.status(200).json({ok:true,status:payment.status});
      const {error}=await sb.from('payment_requests').update({status:'cancelled'}).eq('id',paymentId).neq('status','paid');
      if(error) throw error;
      return res.status(200).json({ok:true,status:'cancelled'});
    }
    // Remove any UNPAID request from the Payment Center. Paid records are protected above.
    // This also lets admins clean up an old pending/unpaid request in one click.
    const {error}=await sb.from('payment_requests').delete().eq('id',paymentId).neq('status','paid');
    if(error) throw error;
    return res.status(200).json({ok:true,removed:true});
  }catch(e){
    console.error('Nexus admin payment action error:',e);
    return res.status(e.status||500).json({error:e.message||'Server error.'});
  }
}
