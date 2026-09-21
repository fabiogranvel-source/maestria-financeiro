export const PROJECT_STATUSES = [
  { value: "approved", label: "Aprovado" },
  { value: "measuring", label: "Aguardando medição" },
  { value: "production", label: "Em produção" },
  { value: "ready", label: "Pronto para instalação" },
  { value: "installing", label: "Instalando" },
  { value: "delivered", label: "Entregue" },
  { value: "finished", label: "Finalizado" },
] as const;

export const BALANCE_MODES = [
  { value: "on_delivery", label: "Na entrega" },
  { value: "fixed_date", label: "Data definida" },
  { value: "installments", label: "Parcelado" },
  { value: "undefined", label: "A definir" },
] as const;

export const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "cash", label: "Dinheiro" },
  { value: "transfer", label: "Transferência" },
  { value: "card", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
  { value: "other", label: "Outro" },
] as const;

export const DEFAULT_CATEGORIES = [
  "MDF",
  "Ferragens",
  "Borda",
  "Montagem",
  "Terceiros",
  "Frete",
  "Funcionários",
  "Pró-labore",
  "Aluguel",
  "Impostos/CNPJ",
  "Contabilidade",
  "Máquinas",
  "Ferramentas",
  "Combustível",
  "Vidros",
  "Pedras",
  "Outros",
];

export const DEFAULT_COST_CATEGORIES = [
  "MDF",
  "Ferragens",
  "Borda",
  "Montagem",
  "Terceiros",
  "Frete",
  "Vidros",
  "Pedras",
  "Instalação",
  "Outros",
];
