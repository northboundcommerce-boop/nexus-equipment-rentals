import { createClient } from '@supabase/supabase-js';

function serverClient(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase server configuration is incomplete.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function requireAdmin(req,sb){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token) throw Object.assign(new Error('Unauthorized.'),{status:401});
  const {data:{user},error}=await sb.auth.getUser(token);
  if(error||!user) throw Object.assign(new Error('Unauthorized.'),{status:401});
  const {data,error:adminError}=await sb.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminError||!data) throw Object.assign(new Error('Administrator access required.'),{status:403});
  return user;
}
async function allAuthUsers(sb){
  const users=[];let page=1;
  while(page<=20){
    const {data,error}=await sb.auth.admin.listUsers({page,perPage:1000});
    if(error)throw error;users.push(...(data.users||[]));
    if((data.users||[]).length<1000)break;page++;
  }
  return users;
}
export default async function handler(req,res){
  if(!['GET','POST','DELETE'].includes(req.method)) return res.status(405).json({error:'Method not allowed.'});
  try{
    const sb=serverClient();await requireAdmin(req,sb);
    if(req.method==='GET'){
      const [{data:rows,error},users]=await Promise.all([sb.from('admin_users').select('user_id,created_at').order('created_at',{ascending:true}),allAuthUsers(sb)]);
      if(error)throw error;
      const map=new Map(users.map(u=>[u.id,u]));
      const ids=(rows||[]).map(x=>x.user_id);
      let profiles=[];
      if(ids.length){const p=await sb.from('profiles').select('id,full_name,email').in('id',ids);profiles=p.data||[]}
      const pmap=new Map(profiles.map(p=>[p.id,p]));
      return res.status(200).json({admins:(rows||[]).map(r=>({user_id:r.user_id,email:pmap.get(r.user_id)?.email||map.get(r.user_id)?.email||'',full_name:pmap.get(r.user_id)?.full_name||'',created_at:r.created_at}))});
    }
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(req.method==='POST'){
      const email=String(body.email||'').trim().toLowerCase();if(!email)return res.status(400).json({error:'Email is required.'});
      const users=await allAuthUsers(sb);const user=users.find(u=>String(u.email||'').toLowerCase()===email);
      if(!user)return res.status(404).json({error:'No Nexus account exists with that email. Have them create an account first.'});
      const {error}=await sb.from('admin_users').upsert({user_id:user.id},{onConflict:'user_id'});if(error)throw error;
      return res.status(200).json({ok:true,user_id:user.id,email:user.email});
    }
    const userId=String(body.user_id||'');if(!userId)return res.status(400).json({error:'User ID is required.'});
    const {count,error:countError}=await sb.from('admin_users').select('*',{count:'exact',head:true});if(countError)throw countError;
    if((count||0)<=1)return res.status(409).json({error:'You cannot remove the last Nexus administrator.'});
    const {error}=await sb.from('admin_users').delete().eq('user_id',userId);if(error)throw error;
    return res.status(200).json({ok:true});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Server error.'});}
}
