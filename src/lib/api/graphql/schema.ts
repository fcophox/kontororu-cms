/**
 * Esquema GraphQL de Kontorōru.
 *
 * Es la MISMA API que REST con otra forma de pedirla: mismos permisos, mismo
 * aislamiento, mismos datos. No hay nada accesible por aquí que no lo esté
 * por REST — si lo hubiera, sería un agujero de autorización con dos puertas.
 */
export const typeDefs = /* GraphQL */ `
  """
  Fecha y hora en ISO 8601.
  """
  scalar DateTime

  """
  Objeto arbitrario. Se usa para \`customFields\` y para el documento del
  editor: su forma la decide el cliente, no el CMS.
  """
  scalar JSON

  enum CategoryKind {
    BLOG
    CASE_STUDY
    SERVICE
    CUSTOM
  }

  enum MediaType {
    image
    video
    document
  }

  type Media {
    id: ID!
    "Firmada, con 24 h de validez. No la guardes: vuelve a pedirla."
    url: String!
    alt: String
    width: Int
    height: Int
  }

  type MediaAsset {
    id: ID!
    url: String!
    alt: String
    width: Int
    height: Int
    mimeType: String!
    sizeBytes: Int!
    createdAt: DateTime!
    "Segundos que le quedan de validez a \`url\`. Pasado ese plazo, vuelve a pedirla."
    expiresIn: Int!
  }

  type Category {
    id: ID!
    slug: String!
    name: String!
    kind: CategoryKind!
    description: String
    locale: String!
    parentId: ID
    "Sólo entradas publicadas: sirve para no enlazar categorías vacías."
    postCount: Int!
  }

  type Tag {
    id: ID!
    slug: String!
    name: String!
  }

  type Seo {
    title: String
    description: String
    ogImage: String
  }

  """
  Otra versión del mismo contenido. Sólo se listan las publicadas: enlazar a
  un borrador daría un 404 a tus visitantes y a los buscadores.
  """
  type Translation {
    locale: String!
    slug: String!
  }

  type Content {
    "Saneado en el servidor con allowlist de etiquetas y atributos."
    html: String!
    "El documento estructurado, si prefieres renderizar tus componentes."
    json: JSON!
  }

  type Post {
    id: ID!
    slug: String!
    locale: String!
    translations: [Translation!]!
    title: String!
    excerpt: String
    publishedAt: DateTime
    updatedAt: DateTime
    readingTime: Int
    seo: Seo!
    customFields: JSON!
    category: Category
    cover: Media
    tags: [Tag!]!
    """
    Cuerpo del contenido.

    Sólo se resuelve si lo pides, y pedirlo en un listado grande multiplica el
    peso de la respuesta: es la diferencia entre una portada y una página de
    artículo.
    """
    content: Content
  }

  type PageInfo {
    hasMore: Boolean!
    nextCursor: String
  }

  type PostPage {
    nodes: [Post!]!
    pageInfo: PageInfo!
  }

  type MediaPage {
    nodes: [MediaAsset!]!
    pageInfo: PageInfo!
  }

  """
  Todos los campos de \`Query\` son anulables, y eso es deliberado.

  Una consulta puede pedir a la vez cosas que dependen de permisos distintos
  —contenido y medios lo son— y en GraphQL un campo obligatorio que falla
  arrastra el null hasta la raíz: un solo permiso ausente dejaría la respuesta
  entera vacía. Siendo anulables, lo que falla se anula solo, viaja su error en
  \`errors\` con su código, y el resto llega. Agrupar consultas no debe salir
  más caro que hacerlas por separado.
  """
  type Query {
    """
    Contenido publicado, del más reciente al más antiguo.

    Sin \`locale\` se sirve el idioma principal del espacio, nunca todos
    mezclados.
    """
    posts(
      limit: Int = 20
      cursor: String
      locale: String
      category: String
      tag: String
      q: String
    ): PostPage

    "Una entrada por su slug. Devuelve null si no hay nada publicado con él."
    post(slug: String!, locale: String): Post

    categories(locale: String, kind: CategoryKind): [Category!]

    "Biblioteca de archivos. Requiere el permiso \`media:read\`."
    media(limit: Int = 20, cursor: String, type: MediaType): MediaPage

    mediaAsset(id: ID!): MediaAsset
  }
`;
