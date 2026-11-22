# Aparta Suite La Flora

Portal de administración comercial del edificio Aparta Suite La Flora en Cali. La aplicación usa el proyecto Supabase activo `la-flora-gestion` y respeta su esquema y sus políticas RLS existentes. No crea tablas paralelas ni incluye `service_role` en el navegador.

## Lo que ya trae
- Panel adaptable a celular para administración y copropietarios.
- Ocupación en vivo, reservas, huéspedes, noches, tarifas, check-in/check-out y tareas automáticas de aseo.
- Libro por apartamento para ingresos, comisión del 20 %, aseo, insumos, reparaciones, reembolsos, pagos y GMF 4 × 1.000.
- Estados de cuenta mensuales PDF con firma y sello oficiales; estadísticas anuales por suite.
- Creación y restablecimiento de accesos por suite mediante la Edge Function protegida `owner-credentials`.
- Actualizaciones en tiempo real de apartamentos, reservas, libro, aseos y estados de cuenta.

## Primera cuenta administradora
El proyecto Supabase activo aún no tenía usuarios ni personal al momento de configurar el portal. Crea la cuenta administradora en Supabase → Authentication → Users. Luego, en SQL Editor, asigna únicamente ese correo como personal:

```sql
insert into public.staff (user_id)
select id from auth.users where lower(email) = lower('CORREO_ADMINISTRADORA')
on conflict do nothing;
```

Inicia sesión con el correo y contraseña que creaste. Desde **Copropietarios** puedes generar los accesos por apartamento. La clave temporal se muestra una sola vez y la primera sesión obliga a cambiarla.

## Supabase y datos oficiales
- Proyecto: `la-flora-gestion` (`bxhdpzjezfboyqxjgboy`), URL y clave publicable ya están en `.env.example`; la clave publicable no otorga privilegios por sí sola y las políticas RLS controlan cada lectura.
- La migración `supabase/migrations/20261122025000_guest_names_and_signed_statements.sql` agrega el nombre y tarifa por noche de huéspedes y guarda el sello autorizado en el corte mensual firmado. Ya fue aplicada al proyecto Supabase activo.
- La Edge Function existente `owner-credentials` permite crear o restablecer credenciales. Su código fuente se conserva en `supabase/functions/owner-credentials/index.ts`; usa la clave de servicio solo en el entorno seguro de Supabase.
- En **Datos oficiales**, carga firma y sello auténticos antes de emitir estados de cuenta. El corte mensual guarda una copia junto con el detalle financiero.

## Desarrollo y Cloudflare Pages
```bash
npm install
npm run dev
npm run build
```

El repositorio `geriost01/Apartasuitecomercial` queda listo para conectarse a Cloudflare Pages con rama `main`, comando `npm run build` y carpeta de salida `dist`. `wrangler.toml` y `public/_headers` incluyen la configuración de Pages y cabeceras de seguridad. Al conectar el repositorio a Pages, cada push a `main` activa una nueva compilación y despliegue. La URL de Supabase y la clave publicable también están configuradas como valores predeterminados seguros para que el build funcione sin exponer claves de servidor.
