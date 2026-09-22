/**
 * Esperas sobre CONDICIONES, no sobre el reloj.
 *
 * Función PURA respecto al navegador: no conoce CodeceptJS ni el DOM, sólo
 * llama al lector que recibe. Por eso vive en utils/ y la comparten los Page
 * Objects que necesitan "releer hasta que el valor cambie" (bolsa, PLP).
 */

const INTENTOS = 20
const ESPERA_MS = 500

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Relee el valor real hasta que cumple, y corta en cuanto cumple. Si nunca
 * cumple devuelve el último valor leído, para que la aserción pueda decir
 * exactamente qué encontró en lugar de un timeout mudo.
 */
async function esperarCondicion(leer, condicion, intentos = INTENTOS) {
  let ultimo = null

  for (let i = 0; i < intentos; i++) {
    ultimo = await leer()
    if (condicion(ultimo)) return ultimo
    await pausa(ESPERA_MS)
  }

  return ultimo
}

module.exports = {
  esperarCondicion
}
