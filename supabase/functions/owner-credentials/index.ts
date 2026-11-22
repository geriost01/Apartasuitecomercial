import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const out = (status: number, data: object) => new Response(JSON.stringify(data), {status, headers});
const initialPassword = (apartmentLabel: string) => `Suite${apartmentLabel}`;

async function lease(service: ReturnType<typeof createClient>, userId: string) {
  const ticket = crypto.randomUUID();
  const {data,error} = await service.rpc("la_flora_claim_credential_lease",{target_user:userId,ticket_id:ticket});
  return !error && data===true ? ticket : null;
}

async function release(service: ReturnType<typeof createClient>, userId: string, ticket: string) {
  await service.from("credential_leases").delete().eq("user_id",userId).eq("ticket",ticket);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (request.method !== "POST") return out(405,{error:"Método no disponible."});
  const authorization = request.headers.get("Authorization") || "";
  const jwt = authorization.match(/^Bearer ([^ ]+)$/)?.[1];
  if (!jwt) return out(401,{error:"Inicia sesión."});
  const caller = createClient(url,publicKey,{...options,global:{headers:{Authorization:authorization}}});
  const service = createClient(url,serviceKey,options);
  const {data:identity,error:authError} = await caller.auth.getUser(jwt);
  if (authError || !identity.user) return out(401,{error:"La sesión expiró. Inicia sesión otra vez."});
  const user = identity.user;
  const body = await request.json().catch(()=>null);
  if (!body) return out(400,{error:"Solicitud inválida."});

  if (body.action === "change") {
    const {password,current} = body;
    if (typeof password !== "string" || password.length<12 || new TextEncoder().encode(password).length>72 || password===current || typeof current!=="string" || !user.email)
      return out(400,{error:"Usa una contraseña nueva de 12 a 72 caracteres."});
    const ticket = await lease(service,user.id);
    if (!ticket) return out(409,{error:"Ya hay un cambio de contraseña en curso. Intenta de nuevo en un momento."});
    try {
      const auth = createClient(url,publicKey,options);
      const {error:compareError} = await auth.auth.signInWithPassword({email:user.email,password:current});
      if (compareError) return out(400,{error:"La contraseña actual no coincide."});
      // Do not change the password if the current sessions could not be revoked.
      const {error:revokeError} = await auth.auth.signOut({scope:"global"});
      if (revokeError) return out(503,{error:"No se pudieron cerrar las sesiones anteriores. Intenta de nuevo."});
      const {error:changeError} = await service.auth.admin.updateUserById(user.id,{password});
      if (changeError) return out(400,{error:"No pudimos cambiar la contraseña. Revisa que cumpla los requisitos."});
      const validAfter = Math.floor(Date.now()/1000)+1;
      const {error:saveError} = await service.from("owner_access").update({must_change:false,valid_after:validAfter}).eq("user_id",user.id);
      if (saveError) return out(500,{error:"Contraseña actualizada. Administración debe revisar el acceso a la unidad."});
      return out(200,{ok:true});
    } finally {
      await release(service,user.id,ticket);
    }
  }
  if (!["issue","reset"].includes(body.action) || !Number.isInteger(body.apartment_id))
    return out(400,{error:"Selecciona una unidad."});

  const {data:staff,error:staffError} = await caller.rpc("la_flora_is_staff");
  if (staffError || staff!==true) return out(403,{error:"Se requiere acceso de administración."});
  const apartmentId = body.apartment_id;
  const {data:apartment,error:apartmentError} = await service.from("apartments").select("label").eq("id",apartmentId).eq("active",true).maybeSingle();
  if (apartmentError || !apartment || !/^[2-5]0[1-6]$/.test(apartment.label)) return out(404,{error:"La unidad no está activa."});

  const {data:existing,error:lookupError} = await service.from("owner_access").select().eq("apartment_id",apartmentId).maybeSingle();
  if (lookupError) return out(500,{error:"No se pudo consultar el acceso."});
  if (Boolean(existing)!==(body.action==="reset")) return out(409,{error:"El estado del acceso cambió. Actualiza el listado."});
  const code = "Suite"+apartment.label;
  // The database constraint stores canonical codes in lowercase with a hyphen.
  const loginCode = "suite-"+apartment.label.toLowerCase();
  const authEmail = "suite-"+apartment.label.toLowerCase()+"@acceso.laflora.invalid";
  // Match the requested initial credential: username and password are both Suite###.
  const password = initialPassword(apartment.label);
  if (existing) {
    const ticket = await lease(service,existing.user_id);
    if (!ticket) return out(409,{error:"Ya hay un cambio de contraseña en curso. Intenta de nuevo en un momento."});
    try {
      const {error:lockError} = await service.from("owner_access").update({must_change:false,valid_after:Math.floor(Date.now()/1000)+1})
        .eq("user_id",existing.user_id).select("user_id").single();
      if (lockError) return out(409,{error:"No se pudo preparar el acceso. Actualiza el listado."});
      const {error:updateError} = await service.auth.admin.updateUserById(existing.user_id,{password});
      if (updateError) return out(500,{error:"Acceso en revisión. Vuelve a generar una contraseña temporal."});
      return out(200,{code,password});
    } finally {
      await release(service,existing.user_id,ticket);
    }
  }

  const {data:created,error:createError} = await service.auth.admin.createUser({
    email:authEmail, password, email_confirm:true,
  });
  if (createError || !created.user) return out(409,{error:"No se pudo crear la cuenta para esta unidad."});
  const userId = created.user.id;
  // Register the password gate before granting any access to the apartment.
  const {error:accessError} = await service.from("owner_access").insert({apartment_id:apartmentId,user_id:userId,login_code:loginCode,must_change:false});
  const linkError = accessError || (await service.from("ownerships").insert({user_id:userId,apartment_id:apartmentId})).error;
  if (linkError) {
    await service.auth.admin.deleteUser(userId);
    return out(500,{error:"No se pudo vincular la cuenta al apartamento."});
  }
  return out(200,{code,password});
});

