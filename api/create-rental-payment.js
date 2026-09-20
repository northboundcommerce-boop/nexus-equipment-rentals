import { createClient } from '@supabase/supabase-js';

const daysInclusive=(a,b)=>{
 const start=new Date(`${a}T00:00:00Z`),end=new Date(`${b}T00:00:00Z`);
 return Math.max(1,Math.floor((end-start)/86400000)+1);
};
const calculate=(days,daily,weekly)=>{
 daily=Number(daily||0); weekly=Number(weekly||0);
 if(!weekly)return days*daily;
 const fullWeeks=Math.floor(days/7),remaining=days%7;
 return fullWeeks*weekly+Math.min(remaining*daily,weekly);
};
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return res.status(401).json({error:'Please sign in again.'});
  const rentalId=req.body?.rental_request_id;if(!rentalId)return res.status(400).json({error:'Rental is required.'});

  const {data:rental,error:rentalError}=await admin.from('rental_requests').select('id,customer_id,equipment_id,start_date,end_date,status').eq('id',rentalId).eq('customer_id',user.id).single();
  if(rentalError||!rental)return res.status(404).json({error:'Rental not found.'});
  if(rental.status!=='confirmed')return res.status(409).json({error:'The contract must be signed before payment is created.'});

  // Idempotency: never create duplicate automatic charges for the same rental.
  const {data:existing}=await admin.from('payment_requests').select('id,amount,status').eq('rental_request_id',rental.id).neq('status','cancelled').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(existing)return res.status(200).json({ok:true,existing:true,payment_request_id:existing.id,amount:Number(existing.amount)});

  const {data:eq,error:eqError}=await admin.from('equipment').select('name,daily_rate,weekly_rate,deposit').eq('id',rental.equipment_id).single();
  if(eqError||!eq)return res.status(404).json({error:'Equipment pricing could not be loaded.'});

  const days=daysInclusive(rental.start_date,rental.end_date);
  const rentalCharge=calculate(days,eq.daily_rate,eq.weekly_rate);
  const deposit=Number(eq.deposit||0);
  const total=Math.round((rentalCharge+deposit)*100)/100;
  if(total<.5)return res.status(400).json({error:'Rental pricing is not configured.'});

  const note=`${eq.name} • ${rental.start_date} to ${rental.end_date} • Rental ${rentalCharge.toFixed(2)} + Deposit ${deposit.toFixed(2)}`;
  const {data:payment,error:payError}=await admin.from('payment_requests').insert({
   customer_id:user.id,rental_request_id:rental.id,title:'Rental + Deposit',amount:total,note,status:'pending'
  }).select('id,amount').single();
  if(payError)throw payError;
  return res.status(200).json({ok:true,payment_request_id:payment.id,amount:Number(payment.amount),rental_charge:rentalCharge,deposit,days});
 }catch(e){console.error(e);return res.status(500).json({error:e.message||'Could not create rental payment.'})}
}