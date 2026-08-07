# Manual de Kontorōru

Cómo se usa el CMS, en orden: quién es quién, cómo se da de alta un cliente y
qué hace cada pantalla.

Escrito para quien **opera** el producto —el equipo de Rukma Studio y las
personas de cada cliente—, no para quien lo programa.

---

## 1. Las dos mitades del producto

Kontorōru tiene dos zonas separadas, y conviene no confundirlas:

**El panel de plataforma** (`/admin`) es de Rukma Studio. Desde ahí se dan de
alta clientes, se cambian planes y se suspende el servicio. Tiene una barra
negra fija para que se note que no estás dentro del espacio de nadie.

**El panel del cliente** (`/<identificador>`) es donde cada cliente gestiona su
contenido. Lleva su logotipo y sus colores. Un cliente sólo ve el suyo, y no
sabe que existen los demás.

> Cada cliente es un **espacio** (en el código, *tenant*). Todo —contenido,
> usuarios, archivos, claves— pertenece a un espacio y nunca se cruza con otro.

---

## 2. Los roles

Hay **cinco** roles: uno de plataforma y cuatro dentro de cada espacio.

### SuperAdmin — el equipo de Rukma Studio

No pertenece a ningún espacio: los atraviesa todos. Es el único que puede
crear clientes, cambiar planes y suspender el servicio. También puede entrar
al panel de cualquier cliente para dar soporte.

No se asigna desde la interfaz. Se marca en la base de datos, a propósito:
convertir a alguien en SuperAdmin da acceso a todos los clientes a la vez.

### Dentro de un espacio

Son acumulativos: cada uno puede todo lo del anterior, y algo más.

| | Colaborador | Editor | Administrador | Propietario |
|---|:--:|:--:|:--:|:--:|
| Escribir **sus** borradores | ✅ | ✅ | ✅ | ✅ |
| Editar contenido **de otros** | — | ✅ | ✅ | ✅ |
| **Publicar** y archivar | — | ✅ | ✅ | ✅ |
| Categorías y etiquetas | — | ✅ | ✅ | ✅ |
| Borrar archivos de otros | — | ✅ | ✅ | ✅ |
| Mandar contenido a la papelera | — | — | ✅ | ✅ |
| Invitar y expulsar personas | — | — | ✅ | ✅ |
| Marca, idiomas, API Keys, Webhooks | — | — | ✅ | ✅ |
| Facturación | — | — | — | ✅ |

**Cómo elegir:**

- **Colaborador** — redactores externos, becarios, alguien de otro
  departamento. Escribe, pero nada suyo sale publicado sin que otro lo
  revise. Es el rol por defecto para quien no conoces.
- **Editor** — el perfil habitual de quien lleva el blog. Publica sin pedir
  permiso, pero no toca la configuración ni puede romper la conexión con la
  web.
- **Administrador** — quien además configura: la marca, los idiomas, las
  claves de la API. Puede invitar gente.
- **Propietario** — el responsable de la cuenta. Suele haber uno, dos como
  mucho.

**Dos cosas que el sistema no te deja hacer, y es a propósito:**

- Nadie puede asignar un rol **superior al suyo**. Un Administrador no crea
  Propietarios.
- No se puede eliminar al **último Propietario** de un espacio. Quedaría un
  espacio sin nadie que pueda invitar ni tocar la facturación.

---

## 3. Dar de alta un cliente nuevo

Sólo el SuperAdmin. Se hace en un paso.

1. Entra en **`/admin`**.
2. Pulsa **«Dar de alta un cliente»**.
3. Rellena:

   | Campo | Qué poner |
   |---|---|
   | **Nombre** | Como se llama el cliente: *Panadería Núñez* |
   | **Identificador** | Se rellena solo desde el nombre (`panaderia-nunez`). Es su URL. |
   | **Email del propietario** | Quien recibirá la invitación |
   | **Plan** | Free, Pro o Enterprise |

4. **Crear espacio e invitar.**

Qué ocurre: se crea el espacio en estado **Prueba**, se envía una invitación
por email al propietario, y quedas en su ficha.

> ⚠️ **El identificador no se puede cambiar después.** Es la URL del cliente y
> viaja en enlaces y en integraciones. Piénsalo antes de darle a crear.

Si el email ya tenía cuenta en Kontorōru —una agencia que lleva varios
clientes— se reutiliza en lugar de duplicarla.

**Si la invitación falla, el espacio no se crea.** Es deliberado: un espacio
sin propietario no sirve para nada, nadie puede entrar a arreglarlo, y encima
bloquea el identificador para siempre.

### Después del alta

En la ficha del cliente (`/admin/<id>`) puedes:

- **Cambiar el estado**: Prueba → Activo cuando empiece a pagar.
- **Ajustar el plan y los límites** por separado. Un cliente puede estar en Pro
  con el doble de almacenamiento negociado, sin inventar un plan nuevo.
- **Abrir su panel** para ver lo que él ve.
- Consultar su **consumo**: contenidos, equipo, almacenamiento, claves. Las
  barras pasan a ámbar al 80 % y a rojo al llegar al límite — para llamar tú
  antes de que llame él.

### Suspender o cancelar

Desde la misma ficha.

- **Suspendido** — corta el acceso al panel y **su API deja de responder**, así
  que su web se queda sin contenido. Para impagos.
- **Cancelado** — igual, pero definitivo de cara al cliente.

En ambos casos **el contenido se conserva** y se recupera entero al reactivar.
El cliente ve una pantalla explicándolo, no un error.

---

## 4. El panel del cliente

Nada más entrar, cada persona ve su espacio. Quien colabora con varios ve un
selector (`/switch`).

### Contenido

El corazón del CMS. La lista tiene pestañas por estado —**Todos, Borradores,
Publicados, Archivados, Papelera**— más buscador y filtros por categoría e
idioma.

**Los tres estados:**

- **Borrador** — sólo se ve dentro del CMS.
- **Publicado** — visible en la web del cliente a través de la API.
- **Archivado** — se retira de la web pero se conserva a mano para reutilizar.

**Escribir una entrada:** *Nueva entrada* → título y cuerpo. El editor admite
títulos, listas, citas, código, destacados, vídeos e imágenes (se arrastran
directamente). Se guarda con el botón **Guardar**; publicar es un paso aparte.

**En la barra lateral** de cada entrada:

- **Categoría** y **Extracto** (el resumen que sale en listados y redes).
- **URL pública** — se puede cambiar. Si la entrada ya está publicada, avisa:
  los enlaces antiguos dejan de funcionar, aunque se notifica a la web del
  cliente para que retire la dirección vieja.
- **Idiomas** — las traducciones de esta entrada y un botón para crear las que
  falten.
- **Historial** — las últimas versiones, con quién las guardó y cuándo.
  Restaurar recupera el texto; **no** cambia la URL ni el estado de
  publicación. Y no destruye nada: lo actual se guarda como una versión más.
- **Campos personalizados** — pares clave/valor libres (`cliente`,
  `duracion`, `urlDemo`) que viajan tal cual en la API. Sirven para lo que el
  CMS no contempla, sin pedir un cambio de programa.
- **Ciclo de vida** — Archivar o Mover a la papelera.

**Papelera:** lo que entra desaparece de la web pero se puede **restaurar**. El
borrado definitivo pide escribir el título de la entrada — es la única acción
del CMS que destruye trabajo sin vuelta atrás.

### Categorías

Blog, Casos de Estudio, Servicios o personalizadas. Cada una muestra cuántas
entradas tiene, para que borrar no sea a ciegas: **borrar una categoría no
borra su contenido**, sólo lo deja sin clasificar.

Las categorías también tienen idioma: un artículo en inglés no puede colgar de
una categoría en español.

### Medios

Todos los archivos subidos. Se pueden subir desde aquí o arrastrándolos al
editor.

**Pon siempre el texto alternativo.** No es decorativo: es lo que leen los
lectores de pantalla en la web del cliente, y viaja en la API junto a la
imagen.

### Equipo

Invitar por email eligiendo rol, cambiar roles y expulsar. Quien no ha
aceptado aún aparece como *invitación pendiente*. El contador muestra el
límite del plan.

---

## 5. Configuración

### Marca

Logotipo, color principal, color secundario y forma de las esquinas. **Los
cambios se ven al momento** mientras mueves el selector, y afectan a todo el
equipo al guardar.

Si tu color queda con poco contraste, el sistema aplica un tono ligeramente
ajustado **sólo sobre los botones**, para que el texto encima siga leyéndose.
Te lo dice y te enseña ambos colores. Tu color exacto se conserva.

Los grises, la tipografía y el espaciado los controla Rukma Studio: eso es lo
que permite mejorar la interfaz para todos sin romperle la marca a nadie.

### Idiomas

Activa los idiomas del espacio y elige el principal.

**Cada idioma es un contenido completo**, con su URL, su SEO y su estado. La
traducción al inglés puede estar en borrador mientras la española lleva un mes
publicada.

El **idioma principal** es el que sirve la API cuando no se le pide ninguno —
así una web ya conectada no cambia de comportamiento al añadir idiomas.

Desactivar un idioma **no borra su contenido**: deja de servirse y de poder
crearse contenido nuevo en él. El sistema avisa de cuántas entradas quedarían
fuera antes de dejarte guardar.

### API Keys

La llave que usa la web del cliente para leer el contenido.

1. **Nueva clave** → nombre (para saber cuál revocar si algo va mal) y
   permisos.
2. **Copia la clave en ese momento.** Se muestra **una sola vez**: guardamos
   sólo un resumen cifrado y no podemos volver a enseñártela. Si se pierde, se
   revoca y se crea otra.

Dos permisos separados:

- **Leer contenido** — entradas y categorías.
- **Leer medios** — la biblioteca entera. Una clave que sólo alimenta un blog
  no necesita poder enumerar todo lo subido.

> 🔒 La clave da acceso a **todo el contenido publicado**. Va en el servidor de
> la web, nunca en el navegador.

Revocar corta el acceso **de inmediato**. Las claves revocadas se conservan en
la lista para poder auditar qué se usó y cuándo.

### Webhooks

Avisan a la web del cliente cuando cambia el contenido, para que se actualice
sola en vez de esperar a la siguiente publicación.

1. **Nuevo webhook** → nombre, dirección (`https://…`) y eventos.
2. Copia el **secreto**: su web lo necesita para comprobar que el aviso viene
   de verdad de Kontorōru.

Sólo se aceptan direcciones públicas por HTTPS. Abajo se ve el registro de
envíos con su resultado; los fallos se reintentan solos con espera creciente
—1, 2, 4, 8, 16 y 32 minutos— y hay botón para reintentar a mano.

---

## 6. Preguntas frecuentes

**Publiqué algo y la web del cliente no lo muestra.**
Mira **Ajustes → Webhooks**: si la última entrega falló, ahí está el motivo.
Reintenta desde el mismo panel.

**Se me ha borrado media entrada.**
Barra lateral → **Historial**. Restaura la versión anterior; lo actual queda
guardado por si acaso.

**Borré una entrada sin querer.**
**Contenido → Papelera** → *Restaurar*. Sólo se pierde de verdad tras escribir
el título para confirmar.

**Cambié la URL y se rompieron enlaces.**
Vuelve a poner la URL anterior en la barra lateral. Avisamos a la web del
cliente con las dos direcciones para que actualice ambas.

**Un colaborador no puede publicar.**
Es lo esperado: el rol Colaborador escribe borradores. Súbelo a Editor en
**Equipo**.

**Perdí la API Key.**
No es recuperable. Revócala y crea otra: sólo hay que cambiarla en la
configuración de la web.

**Un cliente dice que no puede entrar.**
Comprueba su estado en `/admin`. Si está Suspendido, ve una pantalla de pausa,
no un error.

---

## 7. Para el equipo técnico del cliente

Conectar una web al CMS: **[API.md](API.md)**, o directamente el cliente
oficial `@rukma/kontororu-client`, que además trae la verificación de firma de
los webhooks ya resuelta.
