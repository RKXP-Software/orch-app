export function Selo({ rotulo }: { rotulo: [string, string] }) {
  const [texto, tom] = rotulo
  return (
    <span className={`selo ${tom}`}>
      {tom === 'andamento' && <span className="ponto andamento" />}
      {texto}
    </span>
  )
}

export function Progresso({ pct }: { pct: number }) {
  return (
    <div className="barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}
