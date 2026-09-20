import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return res.status(500).json({error:'Server environment is not configured.'});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Admin sign in required.'});
  const {data:{user},error:ue}=await admin.auth.getUser(auth.slice(7));
  if(ue||!user)return res.status(401).json({error:'Invalid or expired admin session.'});
  const {data:isAdmin,error:ae}=await admin.rpc('is_admin',{ });
  // RPC uses auth.uid(), which service role does not inherit from the supplied user's JWT; verify directly.
  const {data:adminRow,error:ar}=await admin.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(ar||!adminRow)return res.status(403).json({error:'Admin access required.'});

  const b=req.body||{},email=(b.email||'').trim().toLowerCase(),fullName=(b.full_name||'').trim();
  if(!email||!fullName)return res.status(400).json({error:'Full name and email are required.'});
  const accountType=b.account_type==='business'?'business':'individual';
  const approval=['pending','approved'].includes(b.approval_status)?b.approval_status:'pending';

  // Invite creates the Auth user and sends the normal Supabase invite/setup email.
  const {data:inv,error:ie}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name:fullName,phone:(b.phone||'').trim(),account_type:accountType,business_name:(b.business_name||'').trim()},redirectTo:'https://nexusequipmentrentals.com/portal.html'});
  if(ie)return res.status(400).json({error:ie.message});
  const id=inv.user.id;
  const {error:pe}=await admin.from('profiles').upsert({id,email,full_name:fullName,phone:(b.phone||'').trim()||null,account_type:accountType,business_name:accountType==='business'?(b.business_name||'').trim()||null:null,approval_status:approval,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(pe)return res.status(400).json({error:'User was invited, but profile setup failed: '+pe.message});
  return res.status(200).json({ok:true,user_id:id,email,approval_status:approval});
 }catch(e){return res.status(500).json({error:e?.message||'Customer creation failed.'})}
}
