/**
 * ============================================================================
 * CATÁLOGO DE TEMAS VISUAIS (themes.js)
 * ============================================================================
 * As variáveis CSS correspondentes a cada `id` ficam definidas em `App.css`.
 * Para adicionar um tema novo, basta criar o bloco `[data-kod-theme="id"]`
 * no CSS e incluir a entrada neste array.
 * ============================================================================
 */
export const DEFAULT_THEME = 'classic';

export const AVAILABLE_THEMES = [
  {
    id: 'classic',
    label: 'Grafite Clássico',
    icon: '🪨',
    badge: 'Padrão',
    desc: 'Cinza industrial fosco, neutro e sem distrações.',
    previewBg: 'linear-gradient(135deg, #0a0a0a 0%, #1f2226 100%)',
    previewCard: '#25292e',
    accent: '#9ca3af'
  },
  {
    id: 'onyx',
    label: 'Ônix & Brasa',
    icon: '🔥',
    badge: 'Quente',
    desc: 'Forja vulcânica com iluminação carmesim e bordas brasa.',
    previewBg: 'radial-gradient(circle at 50% 0%, #450a0a 0%, #090809 80%)',
    previewCard: '#221b1d',
    accent: '#f97316'
  },
  {
    id: 'cyberpunk',
    label: 'Neon Cyber',
    icon: '⚡',
    badge: 'Grade 3D',
    desc: 'Malha synthwave com grade neon ciano e reflexos magenta.',
    previewBg: 'linear-gradient(135deg, #050510 0%, #1e1b4b 100%)',
    previewCard: '#16183d',
    accent: '#22d3ee'
  },
  {
    id: 'obsidian',
    label: 'Obsidiana & Ametista',
    icon: '🔮',
    badge: 'Arcano',
    desc: 'Santuário sombrio em pedra obsidiana e energia violeta.',
    previewBg: 'radial-gradient(circle at 80% 0%, #3b0764 0%, #08060c 80%)',
    previewCard: '#221936',
    accent: '#c084fc'
  },
  {
    id: 'amber',
    label: 'Ouro Imperial',
    icon: '👑',
    badge: 'Relíquia',
    desc: 'Textura diagonal sutil com acabamento em bronze e ouro.',
    previewBg: 'radial-gradient(circle at 50% 0%, #451a03 0%, #0b0906 80%)',
    previewCard: '#292115',
    accent: '#fbbf24'
  },
  {
    id: 'emerald',
    label: 'Bio-Hazard Abissal',
    icon: '🧪',
    badge: 'Tático',
    desc: 'Laboratório subterrâneo com matriz pontilhada esmeralda.',
    previewBg: 'radial-gradient(circle at 50% 0%, #064e3b 0%, #050b08 80%)',
    previewCard: '#152b21',
    accent: '#34d399'
  },
  {
    id: 'crimson',
    label: 'Lua de Sangue',
    icon: '🩸',
    badge: 'Gótico',
    desc: 'Atmosfera vampírica em veludo vinho profundo e carmesim.',
    previewBg: 'radial-gradient(circle at 50% 0%, #4c0519 0%, #0b0406 80%)',
    previewCard: '#2e1018',
    accent: '#fb7185'
  },
  {
    id: 'arctic',
    label: 'Gelo Ártico',
    icon: '❄️',
    badge: 'Cristal',
    desc: 'Superfície glacial translúcida com brilhos em safira e ciano.',
    previewBg: 'radial-gradient(circle at 50% 0%, #0c4a6e 0%, #070c12 80%)',
    previewCard: '#1b2c40',
    accent: '#38bdf8'
  },
  {
    id: 'midnight',
    label: 'Bunker Tático',
    icon: '🌌',
    badge: 'Radar',
    desc: 'Grade de coordenadas militar em azul meia-noite e aço.',
    previewBg: 'linear-gradient(135deg, #080b11 0%, #172554 100%)',
    previewCard: '#1c283e',
    accent: '#60a5fa'
  },
  {
    id: 'void',
    label: 'Vazio Absoluto',
    icon: '🕳️',
    badge: 'OLED',
    desc: 'Preto puro 100% com contraste máximo e bordas de prata.',
    previewBg: '#000000',
    previewCard: '#121216',
    accent: '#ffffff'
  }
];