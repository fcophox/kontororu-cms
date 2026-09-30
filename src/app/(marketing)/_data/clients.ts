/**
 * Quién usa Kontorōru, para la portada.
 *
 * Se mantiene A MANO y no se lee de la tabla `tenants` a propósito: el
 * listado de clientes es información privada del negocio y publicarla sola
 * porque exista una fila sería enseñar la cartera entera sin permiso. Aquí
 * sólo entra quien ha dicho que sí a aparecer.
 */
export type Client = {
  name: string;
  /** Ruta en `public/logos`. El SVG ya viene en claro: la portada es oscura. */
  logo: string;
  /** Tamaño real del SVG. Reserva el hueco y evita que el muro salte al cargar. */
  width: number;
  height: number;
  /**
   * Altura a la que se pinta, en píxeles.
   *
   * Se ajusta logo a logo y no con una altura común: un logotipo apaisado y
   * uno con caja encima pesan distinto al ojo aunque midan lo mismo. Lo que
   * tiene que quedar parejo es el peso visual, no el número.
   */
  displayHeight: number;
  href?: string;
  /** Para qué lo usa. Opcional: si no está, en el muro sólo va el logotipo. */
  usage?: string;
};

export const CLIENTS: readonly Client[] = [
  {
    name: "Rukma Studio",
    logo: "/logos/rukma-logotipo.svg",
    width: 318,
    height: 84,
    displayHeight: 40,
    href: "https://rukma.studio",
  },
  {
    name: "coneXion music band",
    logo: "/logos/conexion-logotipo.svg",
    width: 215,
    height: 56,
    displayHeight: 36,
  },
  {
    name: "12 en punto",
    logo: "/logos/12enpunto-logotipo.svg",
    width: 300,
    height: 82,
    displayHeight: 40,
  },
  {
    name: "JP AKMZ",
    logo: "/logos/jp-logotipo.svg",
    width: 182,
    height: 61,
    displayHeight: 32,
  },
  {
    name: "fcophox",
    logo: "/logos/fcophox-logotipo.svg",
    width: 182,
    height: 44,
    displayHeight: 32,
  },
];

/**
 * El testimonio es de quien hace el producto, así que va aparte del muro:
 * mezclarlo con los clientes lo haría pasar por uno de ellos.
 */
export const TESTIMONIAL = {
  text: "Kontorōru nace de nuestra visión por devolverte el control absoluto de tus contenidos. Una experiencia sin ataduras, diseñada a medida.",
  author: "Equipo de Rukma Studio",
  role: "Creadores de Kontorōru",
};
