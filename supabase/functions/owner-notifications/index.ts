import { createClient } from "npm:@supabase/supabase-js@2";
const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
async function send(to:string,subject:string,text:string){
 const key=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("MAIL_FROM");
 if(!key||!from)throw new Error("email_not_configured");
 const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to,subject,text})});
 if(!res.ok)throw new Error("email_provider_error");
}
async function sha(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const body=await req.json().catch(()=>null);if(!body)return reply(400,{error:"invalid_request"});
 const auth=req.headers.get("Authorization")||"",jwt=auth.match(/^Bearer ([^ ]+)$/)?.[1];
 if(!jwt)return reply(401,{error:"sign_in_required"});
 const caller=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await caller.auth.getUser(jwt);
 if(authError||!user)return reply(401,{error:"session_expired"});
 if(body.action==="request_verification"){
  const email=String(body.email||"").trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{error:"email_invalid"});
  const token=crypto.randomUUID()+crypto.randomUUID(),hash=await sha(token);
  const {error}=await service.from("owner_notification_preferences").upsert({user_id:user.id,email,verified_at:null,verification_hash:hash,verification_expires_at:new Date(Date.now()+30*60*1000).toISOString(),updated_at:new Date().toISOString()});
  if(error)return reply(500,{error:"could_not_save"});
  const origin=Deno.env.get("APP_ORIGIN")||"https://laflora.pages.dev";
  try{await send(email,"Verifica tu correo · Aparta Suite La Flora",`Para recibir avisos de reservas, confirma este correo en 30 minutos: ${origin}/functions/v1/owner-notifications/verify?token=${token}`)}
  catch(e){return reply(503,{error:e instanceof Error&&e.message==="email_not_configured"?"email_not_configured":"verification_email_failed"})}
  return reply(200,{ok:true});
 }
 if(body.action==="reservation_created"){
  const {data:staff}=await caller.rpc("la_flora_is_staff");
  if(staff!==true)return reply(403,{error:"admin_only"});
  const bookingId=String(body.booking_id||"");
  const {data:b,error}=await service.from("bookings").select("id,apartment_id,arrival,departure,status").eq("id",bookingId).maybeSingle();
  if(error||!b||b.status!=="confirmed")return reply(400,{error:"confirmed_booking_required"});
  const {data:access}=await service.from("owner_access").select("user_id").eq("apartment_id",b.apartment_id).maybeSingle();
  if(!access?.user_id)return reply(200,{ok:true,skipped:"owner_not_assigned"});
  const {data:p}=await service.from("owner_notification_preferences").select("email,verified_at,reservation_alerts").eq("user_id",access.user_id).maybeSingle();
  if(!p?.email||!p.verified_at||!p.reservation_alerts)return reply(200,{ok:true,skipped:"owner_notifications_not_ready"});
  const {data:sent}=await service.from("owner_notification_events").select("id").eq("booking_id",b.id).maybeSingle();
  if(sent)return reply(200,{ok:true,duplicate:true});
  const unit=String(b.apartment_id);
  const subject="Nueva reserva para tu suite · Aparta Suite La Flora";
  const text=`Tu suite tiene una nueva reserva confirmada.\n\nSuite ${unit}\nLlegada: ${b.arrival}\nSalida: ${b.departure}\n\nConsulta tus estadísticas en https://laflora.pages.dev`;
  try{await send(p.email,subject,text)}catch(e){return reply(503,{error:e instanceof Error&&e.message==="email_not_configured"?"email_not_configured":"reservation_email_failed"})}
  const {error:logError}=await service.from("owner_notification_events").insert({booking_id:b.id,owner_id:access.user_id,email:p.email});
  if(logError)return reply(500,{error:"notification_log_failed"});
  return reply(200,{ok:true,sent:true});
 }
 return reply(400,{error:"unknown_action"});
});