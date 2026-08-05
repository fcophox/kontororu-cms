/**
 * `server-only` lanza un error si se importa fuera de un Server Component, y
 * Vitest resuelve la condición de cliente. Los tests SÍ ejercitan código de
 * servidor a propósito, así que se sustituye por un módulo vacío.
 *
 * No debilita la protección real: en el build de Next el paquete auténtico
 * sigue en su sitio y rompería el bundle si alguien importara esto desde un
 * componente cliente.
 */
export {};
