// Provincias y cantones oficiales del Ecuador (24 provincias, 221 cantones).
// Fuente: codificación DPA de INEC, verificada y corregida contra Wikipedia/Asamblea Nacional
// (p.ej. La Concordia pasó de Esmeraldas a Santo Domingo de los Tsáchilas en 2013).
// No incluye zonas no delimitadas (Las Golondrinas, Manga del Cura, El Piedrero).
export const ECUADOR_PROVINCES: Record<string, string[]> = {
  "Azuay": ["Camilo Ponce Enríquez", "Chordeleg", "Cuenca", "El Pan", "Girón", "Guachapala", "Gualaceo", "Nabón", "Oña", "Paute", "Pucará", "San Fernando", "Santa Isabel", "Sevilla de Oro", "Sigsig"],
  "Bolívar": ["Caluma", "Chillanes", "Chimbo", "Echeandía", "Guaranda", "Las Naves", "San Miguel"],
  "Cañar": ["Azogues", "Biblián", "Cañar", "Déleg", "El Tambo", "La Troncal", "Suscal"],
  "Carchi": ["Bolívar", "Espejo", "Mira", "Montúfar", "San Pedro de Huaca", "Tulcán"],
  "Chimborazo": ["Alausí", "Chambo", "Chunchi", "Colta", "Cumandá", "Guamote", "Guano", "Pallatanga", "Penipe", "Riobamba"],
  "Cotopaxi": ["La Maná", "Latacunga", "Pangua", "Pujilí", "Salcedo", "Saquisilí", "Sigchos"],
  "El Oro": ["Arenillas", "Atahualpa", "Balsas", "Chilla", "El Guabo", "Huaquillas", "Las Lajas", "Machala", "Marcabelí", "Pasaje", "Piñas", "Portovelo", "Santa Rosa", "Zaruma"],
  "Esmeraldas": ["Atacames", "Eloy Alfaro", "Esmeraldas", "Muisne", "Quinindé", "Rioverde", "San Lorenzo"],
  "Galápagos": ["Isabela", "San Cristóbal", "Santa Cruz"],
  "Guayas": ["Alfredo Baquerizo Moreno (Juján)", "Balao", "Balzar", "Colimes", "Coronel Marcelino Maridueña", "Daule", "Durán", "El Empalme", "El Triunfo", "General Antonio Elizalde", "Guayaquil", "Isidro Ayora", "Lomas de Sargentillo", "Milagro", "Naranjal", "Naranjito", "Nobol", "Palestina", "Pedro Carbo", "Playas", "Salitre (Urbina Jado)", "Samborondón", "San Jacinto de Yaguachi", "Santa Lucía", "Simón Bolívar"],
  "Imbabura": ["Antonio Ante", "Cotacachi", "Ibarra", "Otavalo", "Pimampiro", "San Miguel de Urcuquí"],
  "Loja": ["Calvas", "Catamayo", "Celica", "Chaguarpamba", "Espíndola", "Gonzanamá", "Loja", "Macará", "Olmedo", "Paltas", "Pindal", "Puyango", "Quilanga", "Saraguro", "Sozoranga", "Zapotillo"],
  "Los Ríos": ["Baba", "Babahoyo", "Buena Fe", "Mocache", "Montalvo", "Palenque", "Puebloviejo", "Quevedo", "Quinsaloma", "Urdaneta", "Valencia", "Ventanas", "Vinces"],
  "Manabí": ["24 de Mayo", "Bolívar", "Chone", "El Carmen", "Flavio Alfaro", "Jama", "Jaramijó", "Jipijapa", "Junín", "Manta", "Montecristi", "Olmedo", "Paján", "Pedernales", "Pichincha", "Portoviejo", "Puerto López", "Rocafuerte", "San Vicente", "Santa Ana", "Sucre", "Tosagua"],
  "Morona Santiago": ["Gualaquiza", "Huamboya", "Limón Indanza", "Logroño", "Morona", "Pablo Sexto", "Palora", "San Juan Bosco", "Santiago", "Sucúa", "Taisha", "Tiwintza"],
  "Napo": ["Archidona", "Carlos Julio Arosemena Tola", "El Chaco", "Quijos", "Tena"],
  "Orellana": ["Aguarico", "Francisco de Orellana", "La Joya de los Sachas", "Loreto"],
  "Pastaza": ["Arajuno", "Mera", "Pastaza", "Santa Clara"],
  "Pichincha": ["Cayambe", "Mejía", "Pedro Moncayo", "Pedro Vicente Maldonado", "Puerto Quito", "Quito", "Rumiñahui", "San Miguel de los Bancos"],
  "Santa Elena": ["La Libertad", "Salinas", "Santa Elena"],
  "Santo Domingo de los Tsáchilas": ["La Concordia", "Santo Domingo"],
  "Sucumbíos": ["Cascales", "Cuyabeno", "Gonzalo Pizarro", "Lago Agrio", "Putumayo", "Shushufindi", "Sucumbíos"],
  "Tungurahua": ["Ambato", "Baños de Agua Santa", "Cevallos", "Mocha", "Patate", "Quero", "San Pedro de Pelileo", "Santiago de Píllaro", "Tisaleo"],
  "Zamora Chinchipe": ["Centinela del Cóndor", "Chinchipe", "El Pangui", "Nangaritza", "Palanda", "Paquisha", "Yacuambi", "Yantzaza (Yanzatza)", "Zamora"],
};

// Flattened, alphabetized, de-duplicated list of every cantón — for a single-field city picklist
// (no separate province step) like the Rider apply form's.
export const ECUADOR_CITIES: string[] = Array.from(new Set(Object.values(ECUADOR_PROVINCES).flat())).sort((a, b) =>
  a.localeCompare(b, 'es'),
);
