/**
 * El hash de contrasenas, como puerto.
 *
 * Existe por la misma razon que `IClock`: argon2 es un binario nativo y un
 * caso de uso que lo importe directo no se puede probar sin el. Ademas deja
 * cambiar de algoritmo el dia que argon2 deje de ser la recomendacion, sin
 * tocar una linea de la capa de aplicacion.
 *
 * `verify` recibe el hash primero para que sea imposible invertir los
 * argumentos sin que el tipo lo note... y por eso los dos son `string`: el
 * orden lo fija el nombre del parametro, no el compilador. Se documenta aca y
 * se respeta.
 */
export interface IPasswordHasher {
  hash(plainPassword: string): Promise<string>

  /**
   * `false` cuando no coincide. NO tira: una contrasena incorrecta es un dato
   * esperado, no un error de programa, y un throw obliga a envolver el caso de
   * uso en un try/catch que despues se traga cosas de verdad.
   */
  verify(passwordHash: string, plainPassword: string): Promise<boolean>
}
