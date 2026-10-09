// Fichas técnicas de consumo e custo (PDF "Fichas técnicas de consumo e custo - 09/10/2026").
// Consumo por peça igual em todos os tamanhos. Preços de referência histórica: conferir antes da compra.
// "produto" é a regra que liga a ficha ao nome do produto no site.
(function (raiz) {
  const COMUNS = [
    ['Etiqueta de composição', 1, 'un', 0.07],
    ['Etiqueta bordada gola colorida', 1, 'un', 0.194],
    ['TAG Orientações', 1, 'un', 0.1733],
    ['TAG Coleção', 1, 'un', 0.1224],
    ['Pin plástico / lacre', 1, 'un', 0.0304],
    ['Papel seda 50 × 70', 1, 'folha', 0.41],
    ['Adesivo Pintar Brincar e Lavar', 1, 'un', 0.09],
    ['Embalagem plástica', 1, 'un', 0.233],
  ];
  // Tecido estampado (todas as estampas): comprado em rolos.
  raiz.TECIDO_ESTAMPADO = { nome: 'Baviera Estampado 100% algodão', fornecedor: 'Lancaster', codigo: '19044', gramatura: 150, largura: 1.78, precoKg: 82.5, mPorKg: 3.74, kgRolo: 16, minRolos: 3 };
  const T = raiz.TECIDO_ESTAMPADO;
  const f = (sku, nome, produto, materiais, mao) => ({
    sku, nome, produto,
    materiais: [...materiais, ...COMUNS].map(([insumo, porPeca, unidade, preco]) => { const estampa = /^tecido/i.test(insumo); return { insumo, porPeca, unidade, preco: estampa ? T.precoKg / T.mPorKg : preco, tecido: /^(tecido|ribana|tule)/i.test(insumo), estampa, codigo: estampa ? T.codigo : '' }; }),
    mao: mao.map(([etapa, preco]) => ({ etapa, preco })),
  });
  raiz.FICHAS = [
    f('VEVP', 'Vestido Voa Passarinho', /^vestido infantil para colorir voa passarinho/i,
      [['Tecido Voa Passarinho', 0.649, 'm', 22.90], ['Ribana amarela', 0.15, 'm', 19.74]],
      [['Corte', 2.00], ['Costura', 12.90], ['Dobra', 1.40]]),
    f('BLVP', 'Blusa Voa Passarinho', /^blusa infantil para colorir voa passarinho/i,
      [['Tecido Voa Passarinho', 0.396, 'm', 22.90], ['Ribana amarela', 0.15, 'm', 19.74]],
      [['Corte', 1.50], ['Costura', 8.00], ['Dobra', 1.40]]),
    f('CAVP', 'Camiseta Voa Passarinho', /^camiseta infantil para colorir voa passarinho/i,
      [['Tecido Voa Passarinho', 0.35904, 'm', 22.90], ['Ribana amarela', 0.0225, 'm', 19.74]],
      [['Corte', 2.00], ['Costura', 5.00], ['Dobra', 1.40]]),
    f('VEDIA', 'Vestido Dia de Brincar', /^vestido infantil para colorir dia de brincar/i,
      [['Tecido Vestido Dia de Brincar', 0.55, 'm', 22.90], ['Tule Vestido Dia de Brincar', 0.165, 'm', 7.55], ['Botão Vestido Dia de Brincar', 1, 'un', 0.0507]],
      [['Corte', 2.00], ['Costura', 8.00], ['Dobra', 1.40]]),
    f('CA BR NA VE', 'Camiseta Dia de Brincar · ribana verde', /^camiseta infantil para colorir dia de brincar/i,
      [['Tecido Camiseta Dia de Brincar', 0.35904, 'm', 24.00], ['Ribana verde', 0.0225, 'm', 21.34]],
      [['Corte', 2.00], ['Costura', 5.00], ['Dobra', 1.40]]),
    f('CA PE NA PR', 'Camiseta Pets · ribana preta', /^camiseta infantil para colorir pets/i,
      [['Tecido Camiseta Pets', 0.35904, 'm', 24.00], ['Ribana preta', 0.0225, 'm', 18.87]],
      [['Corte', 2.00], ['Costura', 5.00], ['Dobra', 1.40]]),
  ];
  raiz.fichaDe = (produto) => raiz.FICHAS.find((x) => x.produto.test(String(produto || '').replace(/\s+/g, ' ').trim())) || null;
})(typeof window !== 'undefined' ? window : globalThis);
