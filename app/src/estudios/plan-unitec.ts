// Plan de estudios de Ingeniería en Sistemas Computacionales de UNITEC (plan 2025, presencial), tal como
// lo publica la universidad: 17 períodos y 230 créditos. Es información pública; lo personal (qué está
// aprobado, las notas) vive solo en la tabla estudios de cada usuario.
// Los laboratorios tienen código y créditos propios, así que van en su propia fila.
// Las electivas y la fase final quedan con el nombre genérico: al elegir, se edita la materia.
import type { NuevaMateria } from './useEstudios.ts'

export const PLAN = {
  nombre: 'Ingeniería en Sistemas Computacionales',
  universidad: 'UNITEC',
  version: '2025',
  fuente: 'https://www.unitec.edu/assets/program/ingenieria-sistemas-computacionales-1021-presencial.pdf',
  periodos: 17,
  creditos: 230,
} as const

const ELECTIVAS = 'Se elige entre CCC504 Tecnologías emergentes, CCC427 Gobernabilidad de tecnologías de información, '
  + 'CCC428 Concurrencia y sistemas distribuidos, CCC424 Desarrollo de aplicaciones móviles I y CCC425 Desarrollo de aplicaciones móviles II.'

type Fila = [codigo: string, asignatura: string, creditos: number, notas?: string]

const POR_PERIODO: Fila[][] = [
  [ // I
    ['MAT101', 'Introducción al álgebra', 4],
    ['ESP103', 'Comunicación oral y escrita', 4],
    ['CCC107', 'Introducción a la computación', 4],
    ['ING105', 'Inglés I', 3],
  ],
  [ // II
    ['MAT102', 'Álgebra', 4],
    ['SOC101', 'Sociología', 3],
    ['CCC104', 'Programación I', 3],
    ['LCP104', 'Programación I, laboratorio', 1],
    ['ING106', 'Inglés II', 3],
  ],
  [ // III
    ['MAT103', 'Geometría y trigonometría', 4],
    ['FIL101', 'Filosofía', 3],
    ['CCC105', 'Programación II', 3],
    ['LCP105', 'Programación II, laboratorio', 1],
    ['ING107', 'Inglés III', 3],
  ],
  [ // IV
    ['MAT109', 'Cálculo I', 4],
    ['MAT105', 'Álgebra lineal', 4],
    ['CCC208', 'Programación III', 3],
    ['LCP208', 'Programación III, laboratorio', 1],
    ['ING108', 'Inglés IV', 3],
  ],
  [ // V
    ['MAT210', 'Cálculo II', 4],
    ['HIS101', 'Historia de Honduras', 3],
    ['CCC209', 'Estructura de datos I', 4],
    ['ING109', 'Inglés V', 3],
  ],
  [ // VI
    ['MAT203', 'Ecuaciones diferenciales', 4],
    ['FIS201', 'Física I', 4],
    ['CCC211', 'Estructura de datos II', 4],
    ['ING110', 'Inglés VI', 3],
  ],
  [ // VII
    ['MAT301', 'Estadística matemática I', 4],
    ['FIS202', 'Física II', 4],
    ['ART/DEP', 'Electiva de arte o deporte', 3],
    ['ING111', 'Inglés VII', 3],
  ],
  [ // VIII
    ['TLL314', 'Metodología de investigación', 1],
    ['FIS203', 'Física III', 4],
    ['CCC303', 'Teoría de base de datos I', 4],
    ['ING112', 'Inglés VIII', 3],
  ],
  [ // IX
    ['MAT303', 'Matemáticas discretas', 4],
    ['SEL316', 'Diseño de sistemas digitales', 4],
    ['CCC304', 'Teoría de base de datos II', 4],
    ['IND432', 'Sistemas de gestión de la innovación y tecnología', 4],
  ],
  [ // X
    ['CCC408', 'Teoría de la computación', 4],
    ['CCC403', 'Organización de computadoras', 4],
    ['CON319', 'Contabilidad gerencial', 4],
    ['EMP401', 'Generación de empresas I', 3, 'Requisito: 113 créditos aprobados.'],
  ],
  [ // XI
    ['CCC405', 'Lenguajes de programación', 4],
    ['CCC401', 'Sistemas operativos I', 4],
    ['CCC307', 'Experiencia de usuario', 4],
    ['EMP402', 'Generación de empresas II', 3],
  ],
  [ // XII
    ['CCC407', 'Análisis de algoritmos', 4],
    ['CCC402', 'Sistemas operativos II', 4],
    ['CCC312', 'Desarrollo web', 4],
    ['CDD302', 'Ética y legislación de datos', 4],
  ],
  [ // XIII
    ['CCC501', 'Compiladores I', 4],
    ['TEL102', 'Fundamentos de redes', 4],
    ['CCC426', 'Arquitectura de aplicaciones de vanguardia', 4],
    ['BIO205', 'Ecología y desarrollo sostenible', 3],
  ],
  [ // XIV
    ['CCC502', 'Compiladores II', 4],
    ['CCC421', 'DevOps', 4],
    ['CCC422', 'Proyecto de ingeniería de software I', 4],
    ['EFECCC1', 'Electiva de formación específica I', 4, ELECTIVAS],
  ],
  [ // XV
    ['CCC414', 'Sistemas inteligentes', 4],
    ['CCC415', 'Seguridad de la información', 4],
    ['CCC423', 'Proyecto de ingeniería de software II', 4],
    ['EFECCC2', 'Electiva de formación específica II', 4, ELECTIVAS],
  ],
  [ // XVI
    ['CCC593/CCC595', 'Proyecto de graduación o práctica profesional, fase I', 4,
      'Se elige entre Proyecto de graduación (CCC593) y Práctica profesional (CCC595). '
      + 'Requisito: 218 créditos aprobados y un índice de graduación de 70 % o más.'],
  ],
  [ // XVII
    ['CCC594/CCC596', 'Proyecto de graduación o práctica profesional, fase II', 4,
      'Sigue lo elegido en el período XVI: Proyecto de graduación (CCC594) o Práctica profesional (CCC596).'],
  ],
]

/** Las materias del plan, listas para agregarlas de una vez a la tabla estudios. */
export const MATERIAS_DEL_PLAN: NuevaMateria[] = POR_PERIODO.flatMap((filas, i) =>
  filas.map(([codigo, asignatura, creditos, notas]) => ({ periodo: i + 1, codigo, asignatura, creditos, notas: notas ?? null })))
