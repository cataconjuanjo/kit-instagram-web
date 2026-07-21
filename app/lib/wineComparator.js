export function alternarVinoComparador(vinosComparador, vino, limite = 4) {
  if (vinosComparador.find(item => item.id === vino.id)) {
    return vinosComparador.filter(item => item.id !== vino.id)
  }

  if (vinosComparador.length >= limite) return vinosComparador
  return [...vinosComparador, vino]
}
