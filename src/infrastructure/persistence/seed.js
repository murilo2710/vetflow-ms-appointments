// Tabela inicial de serviços e preços (valores em centavos), gravada na primeira inicialização.
export const SEED_SERVICES = Object.freeze([
  { id: 'consulta-clinica', name: 'Consulta clínica', priceCents: 15000, durationMin: 30, active: true },
  { id: 'vacinacao', name: 'Vacinação', priceCents: 9000, durationMin: 15, active: true },
  { id: 'retorno', name: 'Retorno', priceCents: 6000, durationMin: 20, active: true },
  { id: 'exame-sangue', name: 'Coleta de exame de sangue', priceCents: 12000, durationMin: 20, active: true },
  { id: 'avaliacao-cirurgica', name: 'Avaliação pré-cirúrgica', priceCents: 18000, durationMin: 45, active: true }
]);
