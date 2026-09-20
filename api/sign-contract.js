import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Sign in required.'});
  const url=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!serviceKey)return res.status(500).json({error:'Server signing environment is not configured.'});
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=auth.slice(7);
  const {data:{user},error:userErr}=await admin.auth.getUser(token);
  if(userErr||!user)return res.status(401).json({error:'Invalid or expired session.'});

  const body=req.body||{};
  if(!body.accepted||!body.signature_name?.trim())return res.status(400).json({error:'Agreement acceptance and signature are required.'});
  const {data:r,error:rErr}=await admin.from('rental_requests').select('*').eq('id',body.rental_request_id).eq('customer_id',user.id).maybeSingle();
  if(rErr||!r)return res.status(404).json({error:rErr?.message||'Rental not found.'});
  if(!['approved','contract_required'].includes(r.status))return res.status(409).json({error:`Rental status ${r.status} cannot be signed.`});

  const [{data:p},{data:v},{data:eq},{data:existing}]=await Promise.all([
   admin.from('profiles').select('*').eq('id',user.id).maybeSingle(),
   admin.from('customer_verifications').select('*').eq('user_id',user.id).maybeSingle(),
   admin.from('equipment').select('*').eq('id',r.equipment_id).maybeSingle(),
   admin.from('rental_contracts').select('id').eq('rental_request_id',r.id).maybeSingle()
  ]);
  if(existing)return res.status(409).json({error:'This rental already has a signed contract.'});

  // Vercel provides the connecting address in platform headers. Never accept an IP from request JSON.
  const forwarded=(req.headers['x-forwarded-for']||'').toString();
  const ip=(req.headers['x-vercel-forwarded-for']||forwarded).toString().split(',')[0].trim() || req.socket?.remoteAddress || null;
  const userAgent=(req.headers['user-agent']||'').toString().slice(0,1000)||null;
  const signedAt=new Date().toISOString();
  const version=body.template_version||'1.0';
  const snapshot={
   version,template_id:body.template_id||null,template_name:body.template_name||'Nexus Equipment Rental Agreement',
   template_storage_path:body.template_storage_path||null,customer_name:body.signature_name.trim(),
   customer_email:p?.email||user.email,customer_phone:p?.phone||null,
   customer_address:[v?.address_line1,v?.city,v?.state,v?.postal_code].filter(Boolean).join(', '),
   equipment_name:eq?.name||'Equipment',start_date:r.start_date,end_date:r.end_date,
   daily_rate:eq?.daily_rate??null,weekly_rate:eq?.weekly_rate??null,deposit:eq?.deposit??null,terms_version:version
  };
  const {data:contract,error:cErr}=await admin.from('rental_contracts').insert({
   rental_request_id:r.id,customer_id:user.id,signature_name:body.signature_name.trim(),accepted:true,
   contract_version:version,contract_snapshot:snapshot,signed_at:signedAt,
   signer_ip:ip,signer_forwarded_for:forwarded.slice(0,1000)||null,signer_user_agent:userAgent,
   signer_email:p?.email||user.email,audit_created_at:signedAt
  }).select('id').single();
  if(cErr)return res.status(400).json({error:cErr.message});

  const {error:uErr}=await admin.from('rental_requests').update({status:'confirmed'}).eq('id',r.id);
  if(uErr){await admin.from('rental_contracts').delete().eq('id',contract.id);return res.status(400).json({error:uErr.message})}
  return res.status(200).json({ok:true,contract_id:contract.id,signed_at:signedAt});
 }catch(e){return res.status(500).json({error:e?.message||'Signing failed.'})}
}
