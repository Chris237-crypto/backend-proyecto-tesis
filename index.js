import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors({
  origin: ['https://proyectotesis.netlify.app'], // ajusta si usas otro origen
  methods: ['GET','POST']
}));
app.use(express.json());

// ---- OpenAI ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ---- Prompts base ----
const systemKidSpanish = `
Eres una tutora de lectoescritura para niños de 3-4 años.
Responde SIEMPRE en español de Perú, con 1 frase corta.
Evita tecnicismos. Usa ejemplos con M, P, L, S, T y vocales.
Nunca incluyas enlaces.
`;

// Salud del backend
app.get('/health', (_req, res) => res.json({ ok: true }));

// ========== SÍLABAS: PISTA ==========
app.post('/api/hint', async (req, res) => {
  const { targetSyllable, slots, letters } = req.body || {};
  console.log('Solicitud /api/hint', { targetSyllable, slots, letters });

  try {
    const r = await openai.responses.create({
      model: MODEL,
      input: [
        { role: 'system', content: systemKidSpanish },
        {
          role: 'user',
          content:
            `Estamos armando la sílaba "${targetSyllable}". ` +
            `Casillas: ${JSON.stringify(slots)} (null=vacío). ` +
            `Letras disponibles: ${Array.isArray(letters) ? letters.join(', ') : ''}. ` +
            `Da UNA sola pista muy breve y positiva para un niño de 3-4 años.`
        }
      ],
      max_output_tokens: 60
    });

    const text = r.output_text?.trim() || 'Junta la consonante con su vocal 😊';
    res.json({ hint: text });
  } catch (e) {
    console.error('Error /api/hint:', e?.code || e?.message || e);
    // Fallback sin IA
    res.json({ hint: 'Junta la consonante con la vocal 🙂' });
  }
});

// ========== SÍLABAS: NUEVOS EJERCICIOS ==========
app.post('/api/exercises', async (req, res) => {
  const { count = 5 } = req.body || {};
  console.log('Solicitud /api/exercises', { count });

  try {
    const r = await openai.responses.create({
      model: MODEL,
      input: [
        { role: 'system', content: systemKidSpanish },
        {
          role: 'user',
          content:
            `Crea ${count} ejercicios de sílabas abiertas (CV). ` +
            `Solo consonantes: M, P, L, S, T. Solo vocales: A, E, I, O, U. ` +
            `Devuélvelos en JSON estrictamente como un arreglo de objetos:
            [
              {"syllable":"MA","letters":["M","A"],"hint":"M + A"},
              ...
            ]
            Sin texto extra.`
        }
      ],
      max_output_tokens: 200
    });

    // Intentar parsear el JSON devuelto en output_text
    let payload;
    try { payload = JSON.parse(r.output_text); } catch {}

    // Acepta directamente un arreglo o objetos con {exercises|data}
    const arr = Array.isArray(payload)
      ? payload
      : payload?.exercises || payload?.data || [];

    const safe = (Array.isArray(arr) ? arr : [])
      .filter(e => e?.syllable && Array.isArray(e?.letters) && e.letters.length === 2)
      .slice(0, count);

    if (!safe.length) {
      console.log('Fallback ejercicios locales');
      return res.json({
        exercises: [
          { syllable: 'MA', letters: ['M','A'], hint: 'M + A' },
          { syllable: 'PE', letters: ['P','E'], hint: 'P + E' },
          { syllable: 'LI', letters: ['L','I'], hint: 'L + I' },
          { syllable: 'SO', letters: ['S','O'], hint: 'S + O' },
          { syllable: 'TU', letters: ['T','U'], hint: 'T + U' },
        ].slice(0, count)
      });
    }

    res.json({ exercises: safe });
  } catch (e) {
    console.error('Error /api/exercises:', e?.code || e?.message || e);
    // Fallback sin IA
    res.json({
      error: 'no_ai',
      exercises: [
        { syllable: 'MA', letters: ['M','A'], hint: 'M + A' },
        { syllable: 'PE', letters: ['P','E'], hint: 'P + E' },
        { syllable: 'LI', letters: ['L','I'], hint: 'L + I' },
        { syllable: 'SO', letters: ['S','O'], hint: 'S + O' },
        { syllable: 'TU', letters: ['T','U'], hint: 'T + U' },
      ].slice(0, count)
    });
  }
});

// ========== MATCH PALABRA–IMAGEN: PISTA ==========
app.post('/api/match/hint', async (req, res) => {
  const { targetWord, options = [] } = req.body || {};
  console.log('Solicitud /api/match/hint', { targetWord, options });

  try {
    const r = await openai.responses.create({
      model: MODEL,
      input: [
        { role: 'system', content: `
Eres una tutora de lectoescritura para niños de 3-4 años.
Responde en español de Perú con 1 frase corta.
No reveles la respuesta exacta; da pista por sonido inicial o idea simple.
`},
        { role: 'user', content:
`Juego: emparejar palabra con imagen.
Palabra objetivo: "${targetWord}".
Otras palabras en pantalla: ${Array.isArray(options) ? options.join(', ') : ''}.
Da UNA pista muy breve. Ej.: "Empieza con Ssss" o "Da luz y está en el cielo".`
        }
      ],
      max_output_tokens: 50
    });

    res.json({
      hint: r.output_text?.trim()
        || `Empieza con "${String(targetWord).charAt(0).toUpperCase()}".`
    });
  } catch (e) {
    console.error('Error /api/match/hint:', e?.code || e?.message || e);
    // Fallback sin IA (gratis)
    res.json({ hint: `Empieza con "${String(targetWord).charAt(0).toUpperCase()}".` });
  }
});

// ========== MATEMÁTICAS: pista para contar ==========
app.post('/api/math/hint', async (req, res) => {
  const { targetNumber, options = [] } = req.body || {};
  console.log('Solicitud /api/math/hint', { targetNumber, options });

  try {
    const r = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        { role: 'system', content: `
Eres una tutora para niños de 3-4 años.
Responde en español de Perú, con 1 sola frase muy corta.
No digas el número exacto; da una ayuda como "Cuenta con tu dedo" o "Mira de uno en uno".
`},
        { role: 'user', content: `
Juego: contar manzanas.
Número correcto (no lo digas): ${targetNumber}.
Opciones en pantalla: ${options.join(', ')}.
Da UNA pista muy breve, amable y sin revelar la respuesta.
` }
      ],
      max_output_tokens: 40
    });

    res.json({ hint: r.output_text?.trim() || 'Cuenta despacito con tu dedo: uno, dos, tres…' });
  } catch (e) {
    console.error('Error /api/math/hint:', e?.code || e?.message || e);
    // fallback gratis
    res.json({ hint: 'Cuenta despacito con tu dedo: uno, dos, tres…' });
  }
});


// ---- Start ----
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`AI server listening on ${port}`);
});

