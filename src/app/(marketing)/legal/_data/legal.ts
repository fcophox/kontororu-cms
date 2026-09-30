/**
 * Textos legales públicos: privacidad y cookies.
 *
 * Replican la estructura de los de website-fcophox (misma forma de bloques,
 * mismo marco legal) pero describen lo que hace ESTE producto, que no es lo
 * mismo: aquí no hay analítica ni formularios propios, y a cambio hay cuentas,
 * contenido de clientes y datos que llegan de las webs de esos clientes.
 *
 * Marco que cubren: Ley 19.628 de Chile y su reforma por la Ley 21.719
 * (vigente desde el 1 de diciembre de 2026), el RGPD europeo y la Directiva
 * ePrivacy para usuarios de la UE.
 *
 * Si cambia lo que se guarda en el navegador (otra cookie, otra clave de
 * localStorage, un script de analítica) o entra un proveedor nuevo, hay que
 * actualizar LEGAL_UPDATED y la sección correspondiente. Si algún día entra
 * una cookie OPCIONAL, además hace falta un aviso de consentimiento: hoy no
 * lo hay porque no hay nada que aceptar ni rechazar.
 */

/** Correo para ejercer derechos. Debe ser uno que se revise de verdad. */
export const LEGAL_EMAIL = "hola@rukma.studio";
export const LEGAL_UPDATED = "2026-09-30";

export type LegalBlock =
  | string
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } };

export type LegalSection = { heading: string; blocks: LegalBlock[] };

export type LegalDoc = {
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
};

export type LegalSlug = "privacidad" | "cookies";

export const LEGAL_SLUGS: LegalSlug[] = ["privacidad", "cookies"];

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  privacidad: {
    title: "Política de privacidad",
    description:
      "Qué datos personales trata Kontorōru, con qué fin, con quién se comparten y cómo ejercer tus derechos.",
    intro:
      "Kontorōru es el CMS headless de Rukma Studio. Esta política explica qué datos personales se tratan cuando visitas esta web o usas el panel, para qué, con quién se comparten y qué derechos tienes sobre ellos.",
    sections: [
      {
        heading: "1. Quién es el responsable",
        blocks: [
          `El responsable de los datos de esta web y de las cuentas del panel es Rukma Studio, con domicilio en Chile. Para cualquier asunto relacionado con tus datos puedes escribir a ${LEGAL_EMAIL}.`,
          "Hay un matiz importante: el contenido que cada cliente publica en su espacio, y los datos que envían los visitantes de la web de ese cliente (por ejemplo, un formulario de contacto conectado a Kontorōru), pertenecen al cliente. Sobre esos datos el responsable es el cliente, y Rukma Studio actúa sólo como encargado: los guarda y los sirve por su cuenta, sin usarlos para nada más. Si enviaste datos a través de la web de un cliente, dirígete primero a él.",
        ],
      },
      {
        heading: "2. Qué datos se tratan y para qué",
        blocks: [
          {
            table: {
              head: ["Origen", "Datos", "Finalidad", "Base legal"],
              rows: [
                [
                  "Cuenta del panel",
                  "Correo, nombre, contraseña (cifrada, nunca en claro) y el rol que tienes en cada espacio",
                  "Darte acceso, saber qué puedes ver y hacer, y enviarte invitaciones y enlaces de recuperación",
                  "La ejecución del contrato con el cliente para el que trabajas",
                ],
                [
                  "Actividad en el panel",
                  "Quién creó, editó, publicó o borró cada contenido y cuándo; historial de versiones",
                  "Poder restaurar versiones y saber quién hizo cada cambio",
                  "Interés legítimo del cliente en controlar su propio contenido",
                ],
                [
                  "Webs de los clientes (por cuenta del cliente)",
                  "Lo que el visitante escriba en los formularios que el cliente conecte: normalmente nombre, correo y mensaje",
                  "Guardarlo en la bandeja del cliente para que lo atienda",
                  "La que el cliente declare en su propia política de privacidad",
                ],
                [
                  "Errores de la aplicación",
                  "Descripción técnica del fallo, página, navegador y sistema. Sin IP, correo ni contenido: se eliminan antes de enviarse",
                  "Detectar y corregir fallos",
                  "Interés legítimo en mantener el servicio funcionando",
                ],
                [
                  "Registros técnicos del servidor",
                  "Dirección IP, fecha y hora, URL solicitada y agente de usuario",
                  "Seguridad, prevención de abusos y diagnóstico de errores",
                  "Interés legítimo en mantener el servicio seguro y operativo",
                ],
              ],
            },
          },
          "Kontorōru no usa analítica de visitas ni publicidad, no vende datos, no elabora perfiles ni toma decisiones automatizadas con efectos jurídicos sobre ti. El servicio no está dirigido a menores de 14 años.",
        ],
      },
      {
        heading: "3. Con quién se comparten",
        blocks: [
          "Sólo con proveedores que los tratan por encargo de Rukma Studio y bajo contrato, para que el servicio funcione:",
          {
            list: [
              "Render Services, Inc. (EE. UU.): alojamiento de la aplicación y registros técnicos.",
              "Supabase, Inc. (EE. UU.): base de datos, cuentas de acceso y almacenamiento de archivos.",
              "Amazon Web Services o Cloudflare (EE. UU.): almacenamiento de archivos, sólo para los clientes que lo tengan contratado así.",
              "Functional Software, Inc. — Sentry (EE. UU.): registro de errores de la aplicación.",
              "El proveedor de correo con el que se envían invitaciones y enlaces de recuperación de contraseña.",
            ],
          },
          "Además, el contenido publicado de cada cliente se entrega por API a la web de ese cliente, que es quien lo muestra. Lo que no está publicado no sale del panel.",
          "Algunos de estos proveedores están fuera de Chile y del Espacio Económico Europeo. Esas transferencias se amparan en cláusulas contractuales tipo o en el Marco de Privacidad de Datos UE–EE. UU. cuando el proveedor está adherido. También se compartirán datos con autoridades si una ley obliga a ello.",
        ],
      },
      {
        heading: "4. Cuánto tiempo se conservan",
        blocks: [
          {
            list: [
              "Cuenta del panel: mientras tengas acceso a algún espacio. Si se te retira de todos, puedes pedir que se elimine.",
              "Contenido y datos de un cliente: mientras dure su contrato. Al terminar, se le entregan si los pide y después se eliminan.",
              "Historial de versiones: las 30 más recientes de cada contenido.",
              "Errores de la aplicación: el plazo de retención de Sentry, 90 días como máximo.",
              "Registros técnicos del servidor: el plazo de retención del proveedor de alojamiento, normalmente días o pocas semanas.",
            ],
          },
        ],
      },
      {
        heading: "5. Tus derechos",
        blocks: [
          "Puedes ejercer en cualquier momento, sin costo, los derechos de:",
          {
            list: [
              "Acceso: saber qué datos tuyos se tratan.",
              "Rectificación: corregir datos inexactos o incompletos.",
              "Supresión: pedir que se eliminen.",
              "Oposición y limitación del tratamiento.",
              "Portabilidad: recibir tus datos en un formato estructurado y de uso común.",
              "Retirar tu consentimiento cuando sea la base del tratamiento, sin que ello afecte a la licitud del tratamiento previo.",
            ],
          },
          `Escribe a ${LEGAL_EMAIL} indicando qué derecho quieres ejercer. La respuesta llegará en un plazo máximo de 30 días. Si tu solicitud se refiere a datos que enviaste a la web de un cliente, se la trasladaremos a él. Si consideras que no se ha atendido bien, puedes reclamar ante la autoridad de control: en Chile, la Agencia de Protección de Datos Personales; en la UE, la autoridad de tu país (en España, la AEPD).`,
        ],
      },
      {
        heading: "6. Seguridad",
        blocks: [
          "El servicio se sirve siempre por HTTPS. El aislamiento entre clientes lo impone la propia base de datos, de modo que un cliente no puede leer datos de otro. Las contraseñas se guardan cifradas, las claves de API se guardan como huella y no en claro, y cada cambio de contenido queda registrado con su autor.",
          "Ningún sistema es infalible: si ocurriera una brecha que afecte a tus datos, se te comunicará y se notificará a la autoridad en los plazos que marca la ley.",
        ],
      },
      {
        heading: "7. Cambios en esta política",
        blocks: [
          "Si esta política cambia de forma relevante, se actualizará la fecha de arriba y, cuando corresponda, se avisará a los usuarios del panel.",
        ],
      },
    ],
  },
  cookies: {
    title: "Política de cookies",
    description: "Qué cookies y almacenamiento local usa Kontorōru y cómo gestionarlos.",
    intro:
      "Las cookies y el almacenamiento local son pequeños datos que una web guarda en tu navegador. Aquí se detallan todos los que usa Kontorōru. Son pocos y todos necesarios: no hay cookies de analítica, de publicidad ni de redes sociales, y por eso no te pedimos que aceptes nada.",
    sections: [
      {
        heading: "Estrictamente necesarias",
        blocks: [
          "Hacen funcionar el panel o recuerdan una elección que tú hiciste. No requieren consentimiento y no sirven para seguirte fuera de Kontorōru.",
          {
            table: {
              head: ["Nombre", "Tipo", "Finalidad", "Duración"],
              rows: [
                [
                  "sb-*-auth-token",
                  "Cookie propia",
                  "Mantener tu sesión iniciada en el panel. Sólo existe si inicias sesión",
                  "400 días, o hasta que cierres sesión",
                ],
                [
                  "sb-*-auth-token-code-verifier",
                  "Cookie propia",
                  "Completar de forma segura una invitación o una recuperación de contraseña",
                  "Unos minutos, hasta completar el paso",
                ],
                [
                  "kntr-theme",
                  "Almacenamiento local",
                  "Recordar si elegiste el tema claro u oscuro",
                  "Hasta que lo borres",
                ],
              ],
            },
          },
          "Si sólo visitas la portada o estas páginas sin iniciar sesión, Kontorōru no guarda ninguna cookie en tu navegador.",
        ],
      },
      {
        heading: "Lo que no usamos",
        blocks: [
          {
            list: [
              "Analítica de visitas: no hay Google Analytics ni ninguna herramienta equivalente.",
              "Publicidad ni píxeles de redes sociales.",
              "Grabación de sesiones: el registro de errores no graba la pantalla ni guarda cookies, y quita tu IP y tu correo antes de enviar nada.",
              "Fuentes de terceros cargadas desde tu navegador: la tipografía se sirve desde el propio dominio.",
            ],
          },
        ],
      },
      {
        heading: "Cómo gestionarlas",
        blocks: [
          "Puedes bloquear o borrar las cookies y el almacenamiento local desde la configuración de tu navegador. Si bloqueas la cookie de sesión, no podrás iniciar sesión en el panel; si borras kntr-theme, el panel vuelve al tema por defecto.",
          "Cerrar sesión elimina la cookie de sesión.",
          "Si algún día Kontorōru incorpora una cookie que no sea estrictamente necesaria, se actualizará esta política y se pedirá tu consentimiento antes de activarla.",
        ],
      },
    ],
  },
};
