@filtros
Feature: Filtros y ordenamiento de resultados en Liverpool
  Como usuario de Liverpool.com.mx
  Quiero ordenar y filtrar los resultados por precio
  Para encontrar productos dentro de mi presupuesto

  Background:
    Given que el usuario se encuentra en la página principal de Liverpool

  @TC-016 @TC-017 @smoke
  Scenario Outline: Ordenar los resultados de menor a mayor precio
    When busca el producto "<producto>"
    And ordena los resultados por "menor precio"
    Then los precios mostrados están ordenados de forma "ascendente"

    Examples:
      | producto   |
      | zapatillas |

  @TC-018
  Scenario: Ordenar los resultados de mayor a menor precio
    When busca el producto "zapatillas"
    And ordena los resultados por "mayor precio"
    Then los precios mostrados están ordenados de forma "descendente"

  @TC-007 @TC-008 @TC-009
  Scenario Outline: Filtrar los resultados por un rango de precio
    When busca el producto "<producto>"
    And filtra los resultados por un precio entre <minimo> y <maximo>
    Then todos los precios mostrados están entre <minimo> y <maximo>

    Examples:
      | producto | minimo | maximo |
      | mochila  | 500    | 2000   |
