import type { Metadata } from 'next';
import { LegalShell, Seccion } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad — Goossip',
  description:
    'Qué datos recoge Goossip, para qué los usa, con quién los comparte y cómo pedir que se borren.',
};

export const dynamic = 'force-static';

export default function PrivacidadPage() {
  return (
    <LegalShell titulo="Aviso de Privacidad" actualizado="16 de septiembre de 2026">
      <p>
        Goossip es un producto de <strong>All Global Holding LLC</strong>. Este aviso explica qué
        datos recogemos, por qué, con quién los compartimos y cómo puedes pedir que los borremos.
        Escrito en español simple a propósito: si algo no se entiende, no sirve.
      </p>

      <Seccion n="1" titulo="Quién es responsable de tus datos">
        <p>
          All Global Holding LLC, contactable en{' '}
          <a href="mailto:luisdelator@vmomentums.info">luisdelator@vmomentums.info</a>. Cualquier
          duda, reclamo o solicitud sobre tus datos llega a ese correo y se responde ahí.
        </p>
      </Seccion>

      <Seccion n="2" titulo="Qué datos recogemos">
        <p>
          <strong>De tu cuenta.</strong> Nombre, correo electrónico y foto de perfil, a través de
          nuestro proveedor de identidad. Los usamos para identificarte y para darte acceso a tu
          espacio de trabajo.
        </p>
        <p>
          <strong>De las cuentas que conectas.</strong> Cuando conectas una cuenta de una
          plataforma externa (por ejemplo TikTok, X, Instagram, Facebook, LinkedIn o YouTube),
          guardamos el identificador público de esa cuenta, su nombre de usuario y los tokens de
          acceso que la plataforma nos entrega. Guardamos únicamente lo necesario para publicar y
          leer lo que tú autorizaste.
        </p>
        <p>
          <strong>Del contenido que creas.</strong> Los textos, imágenes, campañas y calendarios
          que produces dentro de Goossip.
        </p>
        <p>
          <strong>De tus prospectos.</strong> Si conectas formularios de anuncios o un canal de
          mensajería, recibimos los datos que esas personas entregaron voluntariamente: nombre,
          teléfono, correo y las respuestas del formulario.
        </p>
        <p>
          <strong>Técnicos.</strong> Registros de acceso y errores, con fecha y dirección IP, para
          seguridad y diagnóstico.
        </p>
        <p>
          <strong>No recogemos</strong> datos de tarjetas ni cuentas bancarias, ni tu contraseña de
          ninguna red social. La autorización siempre ocurre en el sitio de la plataforma, nunca
          dentro de Goossip.
        </p>
      </Seccion>

      <Seccion n="3" titulo="Para qué los usamos">
        <p>
          Para operar el servicio: publicar en las cuentas que autorizaste, leer las métricas de
          esas publicaciones, recibir y organizar los mensajes de tus prospectos, generar
          borradores de contenido, y avisarte cuando algo requiere tu atención.
        </p>
        <p>
          No vendemos tus datos. No los usamos para publicidad de terceros. No entrenamos modelos
          de inteligencia artificial propios con el contenido de tu cuenta.
        </p>
      </Seccion>

      <Seccion n="4" titulo="Con quién los compartimos">
        <p>
          Solo con los proveedores necesarios para que el servicio funcione, y solo con lo mínimo
          que cada uno necesita:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Las plataformas sociales que tú conectas, para ejecutar lo que autorizaste.</li>
          <li>Nuestro proveedor de autenticación, para identificarte al entrar.</li>
          <li>Nuestro proveedor de infraestructura y base de datos, donde se aloja el servicio.</li>
          <li>
            Nuestro proveedor de conexiones con aplicaciones externas, que administra el flujo de
            autorización y el almacenamiento cifrado de los tokens.
          </li>
          <li>
            Proveedores de modelos de lenguaje, cuando pides que se genere un borrador. Se les
            envía el texto necesario para esa tarea y nada más.
          </li>
        </ul>
        <p>
          También podemos compartir datos si una autoridad competente lo exige por ley, y te lo
          haremos saber salvo que la ley lo prohíba.
        </p>
      </Seccion>

      <Seccion n="5" titulo="Cómo los protegemos">
        <p>
          Todo viaja cifrado en tránsito. Los tokens de acceso a tus redes se guardan cifrados y
          nunca se muestran en la interfaz, ni en registros, ni se envían a tu navegador. El acceso
          interno está limitado a quien lo necesita para operar el servicio.
        </p>
      </Seccion>

      <Seccion n="6" titulo="Cuánto tiempo los conservamos">
        <p>
          Mientras tengas cuenta activa. Si desconectas una red, borramos sus tokens de inmediato.
          Si cierras tu cuenta, borramos tus datos personales y los de tus prospectos dentro de los
          30 días siguientes, salvo lo que la ley nos obligue a conservar.
        </p>
      </Seccion>

      <Seccion n="7" titulo="Tus derechos">
        <p>
          Puedes pedir acceso a tus datos, su corrección, su borrado, o que dejemos de usarlos.
          Puedes revocar el acceso a cualquier red conectada en dos lugares: desde la sección de
          conexiones dentro de Goossip, o desde los ajustes de aplicaciones autorizadas de la
          propia plataforma.
        </p>
        <p>
          <strong>Borrado de datos.</strong> Escribe a{' '}
          <a href="mailto:luisdelator@vmomentums.info">luisdelator@vmomentums.info</a> con el asunto
          &quot;Borrado de datos&quot; desde el correo de tu cuenta. Confirmamos la solicitud en un
          plazo máximo de 5 días hábiles y la ejecutamos dentro de 30 días.
        </p>
      </Seccion>

      <Seccion n="8" titulo="Datos de terceros que tú subes">
        <p>
          Si cargas o recibes datos de otras personas — tus prospectos, tus clientes — tú eres
          responsable de tener el derecho de tratarlos y de haberles dado su propio aviso de
          privacidad. Goossip actúa como encargado de esos datos y los trata únicamente según tus
          instrucciones.
        </p>
      </Seccion>

      <Seccion n="9" titulo="Menores de edad">
        <p>
          Goossip no está dirigido a menores de 18 años y no recogemos datos de menores a
          sabiendas. Si detectamos una cuenta de un menor, la cerramos y borramos sus datos.
        </p>
      </Seccion>

      <Seccion n="10" titulo="Cambios a este aviso">
        <p>
          Si cambiamos algo importante, actualizamos la fecha de arriba y te avisamos por correo o
          dentro de la aplicación antes de que el cambio surta efecto.
        </p>
      </Seccion>
    </LegalShell>
  );
}
