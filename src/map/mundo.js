// Mapa de Mundo en Llamas: 49 territorios en 6 continentes.
//
// Cada territorio agrupa uno o más países reales (nombres de Natural Earth, se usan para
// dibujarlo con scripts/build-map.js). Un país puede venir con `bbox: [lonMin, latMin, lonMax, latMax]`
// para tomar solo sus partes dentro de ese recuadro (ej.: la Guayana Francesa sin Francia).
//
// `neighbors` incluye fronteras terrestres y cruces por mar. El script de build avisa si una
// frontera terrestre real no está declarada; los cruces que no son terrestres se dibujan punteados.
// `label: [lon, lat]` corrige dónde va el número de ejércitos si el centro automático queda feo.

const FRANCIA_EUROPA = { name: 'France', bbox: [-6, 41, 10, 52] };
const GUAYANA_FRANCESA = { name: 'France', bbox: [-55, 1, -51, 6] };

export const MUNDO = {
  id: 'mundo',
  name: 'Mundo',
  continents: {
    norteamerica: { name: 'Norteamérica', bonus: 4, color: '#c9733b' },
    sudamerica: { name: 'Sudamérica', bonus: 4, color: '#5f9a4c' },
    europa: { name: 'Europa', bonus: 5, color: '#4f7fb5' },
    africa: { name: 'África', bonus: 4, color: '#c9a43b' },
    asia: { name: 'Asia', bonus: 6, color: '#b5524f' },
    oceania: { name: 'Oceanía', bonus: 2, color: '#8a5fb0' },
  },
  territories: {
    // ------------------------------------------------------------ Norteamérica (6)
    canada: {
      name: 'Canadá', continent: 'norteamerica', countries: ['Canada'],
      neighbors: ['eeuu', 'groenlandia'], label: [-100, 58],
    },
    eeuu: {
      name: 'Estados Unidos', continent: 'norteamerica', countries: ['United States of America'],
      neighbors: ['canada', 'mexico', 'caribe', 'rusia'], label: [-99, 39],
    },
    mexico: {
      name: 'México', continent: 'norteamerica', countries: ['Mexico'],
      neighbors: ['eeuu', 'centroamerica', 'caribe'], label: [-102, 24],
    },
    groenlandia: {
      name: 'Groenlandia', continent: 'norteamerica', countries: ['Greenland'],
      neighbors: ['canada', 'escandinavia'],
    },
    centroamerica: {
      name: 'Centroamérica', continent: 'norteamerica',
      countries: ['Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama'],
      neighbors: ['mexico', 'caribe', 'colombia'],
    },
    caribe: {
      name: 'Caribe', continent: 'norteamerica',
      countries: ['Cuba', 'Haiti', 'Dominican Rep.', 'Jamaica', 'Bahamas', 'Puerto Rico', 'Trinidad and Tobago'],
      neighbors: ['eeuu', 'mexico', 'centroamerica', 'venezuela'], label: [-77, 21],
    },

    // ------------------------------------------------------------ Sudamérica (8)
    colombia: {
      name: 'Colombia y Ecuador', continent: 'sudamerica', countries: ['Colombia', 'Ecuador'],
      neighbors: ['centroamerica', 'venezuela', 'peru', 'brasil'], label: [-74.5, 2],
    },
    venezuela: {
      name: 'Venezuela y Guayanas', continent: 'sudamerica',
      countries: ['Venezuela', 'Guyana', 'Suriname', GUAYANA_FRANCESA],
      neighbors: ['colombia', 'brasil', 'caribe'], label: [-62, 6.5],
    },
    peru: {
      name: 'Perú', continent: 'sudamerica', countries: ['Peru'],
      neighbors: ['colombia', 'brasil', 'bolivia', 'chile'],
    },
    brasil: {
      name: 'Brasil', continent: 'sudamerica', countries: ['Brazil'],
      neighbors: ['venezuela', 'colombia', 'peru', 'bolivia', 'argentina', 'uruguay', 'sahel'],
    },
    bolivia: {
      name: 'Bolivia y Paraguay', continent: 'sudamerica', countries: ['Bolivia', 'Paraguay'],
      neighbors: ['peru', 'brasil', 'argentina', 'chile'],
    },
    argentina: {
      name: 'Argentina', continent: 'sudamerica', countries: ['Argentina', 'Falkland Is.'],
      neighbors: ['chile', 'bolivia', 'brasil', 'uruguay'], label: [-65, -36],
    },
    chile: {
      name: 'Chile', continent: 'sudamerica', countries: ['Chile'],
      neighbors: ['peru', 'bolivia', 'argentina', 'nueva-zelanda'], label: [-71, -30],
    },
    uruguay: {
      name: 'Uruguay', continent: 'sudamerica', countries: ['Uruguay'],
      neighbors: ['argentina', 'brasil'],
    },

    // ------------------------------------------------------------ Europa (10)
    'reino-unido': {
      name: 'Islas Británicas', continent: 'europa', countries: ['United Kingdom', 'Ireland'],
      neighbors: ['francia', 'escandinavia'],
    },
    iberia: {
      name: 'Península Ibérica', continent: 'europa', countries: ['Spain', 'Portugal'],
      neighbors: ['francia', 'magreb'],
    },
    francia: {
      name: 'Francia y Benelux', continent: 'europa',
      countries: [FRANCIA_EUROPA, 'Belgium', 'Netherlands', 'Luxembourg', 'Switzerland'],
      neighbors: ['iberia', 'reino-unido', 'alemania', 'italia'], label: [2.5, 47],
    },
    italia: {
      name: 'Italia', continent: 'europa', countries: ['Italy'],
      neighbors: ['francia', 'alemania', 'balcanes', 'magreb'], label: [12.5, 43],
    },
    alemania: {
      name: 'Europa Central', continent: 'europa', countries: ['Germany', 'Austria', 'Czechia'],
      neighbors: ['francia', 'italia', 'escandinavia', 'polonia', 'europa-este', 'balcanes'],
    },
    escandinavia: {
      name: 'Escandinavia', continent: 'europa',
      countries: ['Norway', 'Sweden', 'Finland', 'Denmark', 'Iceland'],
      neighbors: ['alemania', 'reino-unido', 'groenlandia', 'rusia', 'polonia'], label: [17, 63],
    },
    polonia: {
      name: 'Polonia y Bálticos', continent: 'europa',
      countries: ['Poland', 'Lithuania', 'Latvia', 'Estonia', 'Belarus'],
      neighbors: ['alemania', 'escandinavia', 'rusia', 'europa-este'],
    },
    'europa-este': {
      name: 'Europa del Este', continent: 'europa',
      countries: ['Ukraine', 'Moldova', 'Romania', 'Hungary', 'Slovakia'],
      neighbors: ['polonia', 'alemania', 'balcanes', 'rusia'], label: [29, 48.5],
    },
    balcanes: {
      name: 'Balcanes', continent: 'europa',
      countries: ['Slovenia', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Kosovo', 'Montenegro', 'Macedonia', 'Albania', 'Greece', 'Bulgaria'],
      neighbors: ['italia', 'alemania', 'europa-este', 'turquia'], label: [22, 42],
    },
    rusia: {
      name: 'Rusia', continent: 'europa', countries: ['Russia'],
      neighbors: ['escandinavia', 'polonia', 'europa-este', 'turquia', 'asia-central', 'mongolia', 'china', 'corea', 'japon', 'eeuu'],
      label: [95, 62],
    },

    // ------------------------------------------------------------ África (10)
    magreb: {
      name: 'Magreb', continent: 'africa',
      countries: ['Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Libya'],
      neighbors: ['iberia', 'italia', 'egipto', 'sahel', 'sudan'], label: [8, 28],
    },
    egipto: {
      name: 'Egipto', continent: 'africa', countries: ['Egypt'],
      neighbors: ['magreb', 'sudan', 'medio-oriente'],
    },
    sahel: {
      name: 'Sahel', continent: 'africa',
      countries: ['Mauritania', 'Mali', 'Niger', 'Chad', 'Burkina Faso', 'Senegal', 'Gambia'],
      neighbors: ['magreb', 'africa-occidental', 'africa-central', 'sudan', 'brasil'], label: [3, 17],
    },
    'africa-occidental': {
      name: 'Golfo de Guinea', continent: 'africa',
      countries: ['Guinea', 'Guinea-Bissau', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Ghana', 'Togo', 'Benin', 'Nigeria'],
      neighbors: ['sahel', 'africa-central'], label: [-2, 9],
    },
    sudan: {
      name: 'Sudán', continent: 'africa', countries: ['Sudan', 'S. Sudan', 'Eritrea'],
      neighbors: ['egipto', 'magreb', 'sahel', 'africa-central', 'cuerno', 'africa-oriental'],
    },
    cuerno: {
      name: 'Cuerno de África', continent: 'africa',
      countries: ['Ethiopia', 'Somalia', 'Somaliland', 'Djibouti', 'Kenya'],
      neighbors: ['sudan', 'africa-oriental', 'arabia'], label: [41, 6],
    },
    'africa-central': {
      name: 'África Central', continent: 'africa',
      countries: ['Cameroon', 'Central African Rep.', 'Gabon', 'Congo', 'Eq. Guinea', 'Dem. Rep. Congo'],
      neighbors: ['sahel', 'africa-occidental', 'sudan', 'africa-oriental', 'africa-austral'], label: [22, 0],
    },
    'africa-oriental': {
      name: 'África Oriental', continent: 'africa',
      countries: ['Tanzania', 'Uganda', 'Rwanda', 'Burundi', 'Malawi', 'Mozambique', 'Zambia'],
      neighbors: ['sudan', 'cuerno', 'africa-central', 'africa-austral', 'madagascar'], label: [33, -9],
    },
    'africa-austral': {
      name: 'África Austral', continent: 'africa',
      countries: ['Angola', 'Namibia', 'Botswana', 'Zimbabwe', 'South Africa', 'Lesotho', 'eSwatini'],
      neighbors: ['africa-central', 'africa-oriental'], label: [22, -24],
    },
    madagascar: {
      name: 'Madagascar', continent: 'africa', countries: ['Madagascar'],
      neighbors: ['africa-oriental'],
    },

    // ------------------------------------------------------------ Asia (11)
    turquia: {
      name: 'Turquía y Cáucaso', continent: 'asia',
      countries: ['Turkey', 'Cyprus', 'N. Cyprus', 'Georgia', 'Armenia', 'Azerbaijan'],
      neighbors: ['balcanes', 'rusia', 'iran', 'medio-oriente'], label: [35, 39],
    },
    'medio-oriente': {
      name: 'Medio Oriente', continent: 'asia',
      countries: ['Syria', 'Iraq', 'Jordan', 'Lebanon', 'Israel', 'Palestine'],
      neighbors: ['turquia', 'iran', 'arabia', 'egipto'], label: [41, 33],
    },
    arabia: {
      name: 'Arabia', continent: 'asia',
      countries: ['Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Kuwait'],
      neighbors: ['medio-oriente', 'iran', 'cuerno'], label: [46, 22],
    },
    iran: {
      name: 'Irán', continent: 'asia', countries: ['Iran'],
      neighbors: ['turquia', 'medio-oriente', 'arabia', 'asia-central', 'india'],
    },
    'asia-central': {
      name: 'Asia Central', continent: 'asia',
      countries: ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Afghanistan'],
      neighbors: ['rusia', 'iran', 'india', 'china'], label: [66, 46],
    },
    india: {
      name: 'India', continent: 'asia',
      countries: ['India', 'Pakistan', 'Nepal', 'Bangladesh', 'Bhutan', 'Sri Lanka'],
      neighbors: ['iran', 'asia-central', 'china', 'sudeste-asiatico'], label: [78, 22],
    },
    china: {
      name: 'China', continent: 'asia', countries: ['China', 'Taiwan'],
      neighbors: ['rusia', 'mongolia', 'asia-central', 'india', 'sudeste-asiatico', 'corea'], label: [103, 33],
    },
    mongolia: {
      name: 'Mongolia', continent: 'asia', countries: ['Mongolia'],
      neighbors: ['rusia', 'china'],
    },
    corea: {
      name: 'Corea', continent: 'asia', countries: ['South Korea', 'North Korea'],
      neighbors: ['china', 'rusia', 'japon'],
    },
    japon: {
      name: 'Japón', continent: 'asia', countries: ['Japan'],
      neighbors: ['corea', 'rusia'], label: [138, 36.5],
    },
    'sudeste-asiatico': {
      name: 'Sudeste Asiático', continent: 'asia',
      countries: ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia'],
      neighbors: ['india', 'china', 'indonesia'], label: [101, 16],
    },

    // ------------------------------------------------------------ Oceanía (4)
    indonesia: {
      name: 'Indonesia y Filipinas', continent: 'oceania',
      countries: ['Indonesia', 'Timor-Leste', 'Brunei', 'Philippines'],
      neighbors: ['sudeste-asiatico', 'melanesia', 'australia'], label: [114, -1],
    },
    melanesia: {
      name: 'Melanesia', continent: 'oceania',
      countries: ['Papua New Guinea', 'Solomon Is.', 'Vanuatu', 'Fiji', 'New Caledonia'],
      neighbors: ['indonesia', 'australia', 'nueva-zelanda'], label: [145, -6.5],
    },
    australia: {
      name: 'Australia', continent: 'oceania', countries: ['Australia'],
      neighbors: ['indonesia', 'melanesia', 'nueva-zelanda'], label: [134, -25],
    },
    'nueva-zelanda': {
      name: 'Nueva Zelanda', continent: 'oceania', countries: ['New Zealand'],
      neighbors: ['australia', 'melanesia', 'chile'], label: [172, -42],
    },
  },

  // Objetivos secretos de conquista (además están los de destruir a un jugador).
  objectives: [
    { id: 'sur-africa', continents: ['sudamerica', 'africa'], minTerritories: 22 },
    { id: 'norte-oceania', continents: ['norteamerica', 'oceania'], partial: { asia: 5 }, minTerritories: 20 },
    { id: 'europa-mas', continents: ['europa'], partial: { asia: 4, africa: 4 }, minTerritories: 22 },
    { id: 'asia-oceania', continents: ['asia'], partial: { oceania: 2 }, minTerritories: 22 },
    { id: 'americas', continents: ['norteamerica', 'sudamerica'], partial: { europa: 3 }, minTerritories: 22 },
    { id: 'africa-oceania', continents: ['africa', 'oceania'], partial: { asia: 4 }, minTerritories: 22 },
    { id: 'europa-sur', continents: ['europa', 'sudamerica'], minTerritories: 22 },
    { id: 'asia-africa', continents: ['asia', 'africa'], minTerritories: 22 },
    {
      id: 'presencia-mundial',
      partial: { norteamerica: 3, sudamerica: 3, europa: 3, africa: 3, asia: 3, oceania: 2 },
      minTerritories: 24,
    },
  ],
};
