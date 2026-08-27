"use client";

import { useEffect, useState } from "react";

export function useTermoBusca(valor: string, atraso = 220) {
  const [termo, setTermo] = useState(valor);

  useEffect(() => {
    const temporizador = window.setTimeout(() => setTermo(valor.trim()), atraso);
    return () => window.clearTimeout(temporizador);
  }, [atraso, valor]);

  return termo;
}
