let until = 0

export function blockAttack(ms = 350) {
  until = performance.now() + ms
}

export function attackBlocked() {
  return performance.now() < until
}
