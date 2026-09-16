import type { Metadata } from 'next';
import { LegalShell, Seccion } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Términos del Servicio — Goossip',
  description: 'Las reglas de uso de Goossip: qué hace, qué puedes hacer con él y qué no.',
};

export const dynamic = 'force-static';

export default function TerminosPage() {
  return (
    <LegalShell titulo="Términos del Servicio" actualizado="16 de septiembre de 2026">
      <p>
        Estos términos rigen el uso de Goossip, un producto de{' '}
        <strong>All Global Holding LLC</strong>, disponible en vliving.life. Al crear una cuenta
        aceptas lo que sigue.
      </p>

      <Seccion n="1" titulo="Qué es Goossip">
        <p>
          Una herramienta de marketing. Conecta las cuentas de redes sociales que tú autorizas,
          publica en ellas el contenido que tú apruebas, recibe los mensajes y prospectos que esas
          cuentas generan, y te ayuda a organizarlos y responderlos.
        </p>
        <p>
          Goossip no compra publicidad por su cuenta, no publica sin tu autorización previa y no
          opera cuentas que no te pertenezcan o que no administres legítimamente.
        </p>
      </Seccion>

      <Seccion n="2" titulo="Tu cuenta">
        <p>
          Necesitas ser mayor de 18 años y dar información verdadera. Eres responsable de lo que
          ocurra bajo tu cuenta y de mantener segura tu forma de acceso. Avísanos de inmediato si
          detectas un acceso que no reconoces.
        </p>
      </Seccion>

      <Seccion n="3" titulo="Cuentas conectadas">
        <p>
          Cuando conectas una red social, esa plataforma nos entrega un permiso limitado en tu
          nombre. Solo pedimos los permisos necesarios para las funciones que usas: leer tu perfil
          básico y publicar el contenido que tú apruebas.
        </p>
        <p>
          Puedes revocar ese permiso cuando quieras, desde la sección de conexiones de Goossip o
          desde los ajustes de la propia plataforma. Al revocarlo, borramos los tokens
          correspondientes.
        </p>
        <p>
          Declaras que eres dueño o administrador autorizado de cada cuenta que conectes. Conectar
          una cuenta ajena sin permiso es causa de cierre inmediato.
        </p>
      </Seccion>

      <Seccion n="4" titulo="Reglas de las plataformas">
        <p>
          El uso de Goossip está sujeto además a los términos de cada red que conectes. No puedes
          usar Goossip para saltarte sus reglas: nada de spam, cuentas falsas, interacción
          artificial, contenido engañoso, ni automatización que esas plataformas prohíban.
        </p>
      </Seccion>

      <Seccion n="5" titulo="Uso aceptable">
        <p>No puedes usar Goossip para:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Publicar contenido ilegal, violento, de odio, sexual con menores, o que acose a alguien.</li>
          <li>Enviar mensajes masivos no solicitados a personas que no te dieron sus datos.</li>
          <li>Suplantar a una persona, marca u organización.</li>
          <li>Extraer datos de terceros sin base legal para tratarlos.</li>
          <li>Intentar vulnerar, sobrecargar o revertir la ingeniería del servicio.</li>
        </ul>
      </Seccion>

      <Seccion n="6" titulo="Tu contenido">
        <p>
          Lo que subes y lo que Goossip genera para ti es tuyo. Nos das únicamente el permiso
          técnico necesario para almacenarlo, procesarlo y publicarlo donde tú indiques. No lo
          usamos para otra cosa, no lo vendemos y no entrenamos modelos propios con él.
        </p>
        <p>
          Eres responsable de tener los derechos sobre lo que publicas, incluidas imágenes, música
          y marcas.
        </p>
      </Seccion>

      <Seccion n="7" titulo="Contenido generado por inteligencia artificial">
        <p>
          Goossip produce borradores con modelos de lenguaje. Esos borradores pueden contener
          errores. La revisión y la aprobación antes de publicar son tuyas, y la responsabilidad
          por lo publicado también.
        </p>
      </Seccion>

      <Seccion n="8" titulo="Pagos">
        <p>
          Si tu plan es de paga, el cobro es por adelantado y por periodo. Puedes cancelar cuando
          quieras y el servicio sigue activo hasta terminar el periodo pagado. Los periodos ya
          consumidos no se reembolsan.
        </p>
      </Seccion>

      <Seccion n="9" titulo="Disponibilidad">
        <p>
          Trabajamos para que el servicio esté siempre arriba, pero no garantizamos operación
          ininterrumpida. Dependemos de plataformas de terceros que pueden cambiar sus reglas, sus
          límites o sus interfaces sin avisarnos, y eso puede afectar funciones de Goossip.
        </p>
      </Seccion>

      <Seccion n="10" titulo="Límite de responsabilidad">
        <p>
          El servicio se presta tal como está. En la medida que la ley lo permita, nuestra
          responsabilidad total frente a ti se limita al monto que nos hayas pagado en los 3 meses
          anteriores al hecho que originó el reclamo. No respondemos por lucro cesante ni por daños
          indirectos.
        </p>
      </Seccion>

      <Seccion n="11" titulo="Terminación">
        <p>
          Puedes cerrar tu cuenta cuando quieras. Nosotros podemos suspenderla o cerrarla si violas
          estos términos o si tu uso pone en riesgo el servicio o a terceros. Al cerrarse, se
          aplica lo dicho en el Aviso de Privacidad sobre conservación y borrado.
        </p>
      </Seccion>

      <Seccion n="12" titulo="Cambios">
        <p>
          Podemos actualizar estos términos. Si el cambio es relevante, te avisamos antes de que
          surta efecto. Seguir usando el servicio después de esa fecha significa que lo aceptas.
        </p>
      </Seccion>

      <Seccion n="13" titulo="Ley aplicable y contacto">
        <p>
          Estos términos se rigen por las leyes de los Estados Unidos Mexicanos, con jurisdicción
          en los tribunales competentes de Quintana Roo, México.
        </p>
        <p>
          Contacto: <a href="mailto:luisdelator@vmomentums.info">luisdelator@vmomentums.info</a>
        </p>
      </Seccion>
    </LegalShell>
  );
}
