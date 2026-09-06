/**
 * Los mensajes que ve el operador. En espanol, porque son valores del negocio
 * y no identificadores.
 *
 * Centralizados por una razon concreta: el mismo error escrito de tres formas
 * distintas en tres casos de uso hace que el operador crea que son tres
 * problemas distintos. Y estan redactados para que se entienda QUE HACER, no
 * para describir el estado interno del sistema.
 */
export const ERROR_MESSAGES = {
  /**
   * Los que arma el borde, no un caso de uso: validacion, ruta inexistente y el
   * generico de un bug nuestro.
   *
   * Estaban escritos a mano adentro del `errorHandler`. Viven aca por la misma
   * razon que el resto: son strings que ve el operador, y un string que ve el
   * operador no se escribe en el lugar donde se usa.
   */
  GENERAL: {
    VALIDATION_ERROR: 'Los datos enviados no son válidos',
    NOT_FOUND: 'El recurso no existe',
    INVALID_MEMBER_NUMBER: 'El número de afiliado no es válido',
    INTERNAL_ERROR: 'Ocurrió un error inesperado. Volvé a intentar',
  },
  AUTH: {
    INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos',
    INACTIVE_USER: 'El usuario está dado de baja',
    FORBIDDEN: 'No tenés permisos para hacer esto',
    UNAUTHENTICATED: 'Iniciá sesión para continuar',
    SESSION_EXPIRED: 'Tu sesión venció. Iniciá sesión de nuevo',
    TOO_MANY_ATTEMPTS: 'Demasiados intentos. Esperá unos minutos',
  },
  PATIENT: {
    NOT_FOUND: 'El paciente no existe',
    LOCALITY_NOT_FOUND: 'La localidad seleccionada no existe',
    PRIMARY_CONTACT_TAKEN:
      'Ese paciente ya tiene un contacto principal. Cambiá el que está marcado antes de marcar otro',
    HAS_EPISODES:
      'No se puede dar de baja un paciente que ya tiene episodios cargados. Si terminó la internación domiciliaria, cerrá el episodio: la baja es solo para un paciente cargado por error',
    ALREADY_DELETED: 'El paciente ya está dado de baja',
  },
  AFFILIATION: {
    NOT_FOUND: 'La afiliación no existe',
    ALREADY_TAKEN:
      'Ya hay un paciente con ese número de afiliado en esa obra social. Buscalo en el listado y vinculá la afiliación, o corregí el número',
    INSURANCE_PROVIDER_NOT_FOUND: 'La obra social no existe',
    NOT_CURRENT: 'Esa afiliación ya está cerrada',
    CLOSES_BEFORE_START: 'La fecha de cierre es anterior al inicio de la afiliación',
  },
  EPISODE: {
    NOT_FOUND: 'El episodio no existe',
    ALREADY_OPEN:
      'El paciente ya tiene un episodio de internación domiciliaria abierto. Cerralo antes de abrir uno nuevo',
    ALREADY_CLOSED: 'El episodio ya está cerrado',
    AFFILIATION_NOT_CURRENT:
      'No se puede abrir un episodio sobre una afiliación cerrada. Cargá la afiliación vigente primero',
    OVERLAPS:
      'Ese período se superpone con otro episodio del paciente. Revisá las fechas',
    CLOSES_BEFORE_START: 'La fecha de cierre es anterior al inicio del episodio',
  },
  CARE_SERVICE: {
    NOT_FOUND: 'La prestación no existe',
    EPISODIO_CERRADO: 'No se pueden agregar prestaciones a un episodio cerrado',
    EMPRESA_SIN_CONVENIO:
      'Esa empresa no tiene convenio con la obra social del paciente. Elegí otra empresa o cargá el convenio',
    PROFESIONAL_SIN_ESPECIALIDAD:
      'El profesional no tiene habilitada esa especialidad',
    DUPLICATED:
      'El paciente ya tiene esa especialidad activa con esa misma empresa en este episodio',
    ALREADY_ENDED: 'La prestación ya está dada de baja',
    NOT_MUTABLE: 'La prestación fue dada de baja o modificada por otra persona',
    ENDS_BEFORE_EPISODE_START:
      'La fecha de baja de la prestación es anterior al inicio del episodio',
    ENDS_AFTER_EPISODE_END:
      'La fecha de baja de la prestación es posterior al cierre del episodio',
    SPECIALTY_NOT_FOUND: 'La especialidad no existe',
    SPECIALTY_INACTIVE: 'La especialidad está dada de baja en el catálogo',
    COMPANY_NOT_FOUND: 'La empresa contratante no existe',
    COMPANY_INACTIVE: 'La empresa contratante está dada de baja en el catálogo',
    PROFESSIONAL_NOT_FOUND: 'El profesional no existe',
    PROFESSIONAL_INACTIVE: 'El profesional está dado de baja en el catálogo',
  },
  AUTHORIZATION: {
    NOT_FOUND: 'La autorización no existe',
    FREQUENCY_NOT_FOUND: 'La frecuencia no existe',
    PRESTACION_DADA_DE_BAJA: 'No se puede autorizar una prestación dada de baja',
    FRECUENCIA_NO_ELEGIBLE:
      'Esa frecuencia no está habilitada para la especialidad de la prestación',
    FRECUENCIA_INACTIVA: 'Esa frecuencia está dada de baja en el catálogo',
    PERIODO_INVALIDO: 'El período termina antes de empezar',
    ALREADY_CLAIMED: 'La renovación ya figura como reclamada',
  },
  /**
   * Administracion de usuarios (D14).
   */
  USER: {
    NOT_FOUND: 'El usuario no existe',
    ALREADY_INACTIVE: 'El usuario ya está dado de baja',
    CANNOT_DEACTIVATE_SELF: 'No podés darte de baja a vos mismo',
    LAST_ADMIN:
      'No se puede dar de baja al último administrador activo: el sistema quedaría sin nadie que administre catálogos ni usuarios',
  },
  /**
   * Administracion de catalogos. Nada se borra: se desactiva (D11).
   */
  CATALOG: {
    SPECIALTY_NOT_FOUND: 'La especialidad no existe',
    FREQUENCY_NOT_FOUND: 'La frecuencia no existe',
    PROFESSIONAL_NOT_FOUND: 'El profesional no existe',
    COMPANY_NOT_FOUND: 'La empresa contratante no existe',
    INSURANCE_PROVIDER_NOT_FOUND: 'La obra social no existe',
    ALREADY_INACTIVE: 'Ese registro ya está dado de baja',
    REPLACEMENT_IS_THE_SAME:
      'La frecuencia nueva es idéntica a la anterior. Si no cambia nada, no hace falta reemplazarla',
  },
  /**
   * Lo que contesta la BASE cuando una constraint del core rechaza la escritura.
   *
   * No son errores de programa: son datos que violan una regla que vive en
   * `prisma/sql/core_invariants.sql`. El operador tiene que leer qué corregir,
   * no el nombre de un índice de Postgres.
   */
  DATABASE: {
    NAME_TAKEN: 'Ya existe un registro con ese nombre',
    EMAIL_TAKEN: 'Ya hay un usuario con ese correo',
    FREQUENCY_TAKEN: 'Esa frecuencia ya existe en el catálogo',
    LINK_ALREADY_EXISTS: 'Esa relación ya está cargada',
    UNIQUE_VIOLATION: 'Ya existe un registro con esos datos',
    REFERENCE_NOT_FOUND: 'Alguno de los datos relacionados no existe',
    STILL_REFERENCED: 'No se puede dar de baja: hay registros que dependen de esto',
    RECORD_NOT_FOUND: 'El registro no existe o fue modificado por otra persona',
    CONSTRAINT_VIOLATION: 'Los datos no cumplen una regla del sistema',
  },
  /**
   * Fallas de configuracion del proceso. No las ve un operador: las ve quien
   * instala, y por eso dicen exactamente que variable falta y por que importa.
   */
  ENV: {
    DATABASE_URL_INVALID: 'DATABASE_URL es obligatoria y apunta a la base de esta coordinación',
    JWT_SECRET_INVALID: 'JWT_SECRET tiene que tener al menos 32 caracteres',
    JWT_REFRESH_SECRET_INVALID: 'JWT_REFRESH_SECRET tiene que tener al menos 32 caracteres y ser DISTINTO de JWT_SECRET',
    JWT_SECRETS_EQUAL: 'JWT_SECRET y JWT_REFRESH_SECRET no pueden ser iguales: con el mismo secreto un access token sirve como refresh',
    NODE_ENV_INVALID: 'NODE_ENV tiene que ser development, production o test',
    ALLOWED_ORIGINS_INVALID: 'ALLOWED_ORIGINS es una lista de URLs separadas por coma',
    COOKIE_SECURE_INVALID: 'COOKIE_SECURE tiene que ser "true" o "false"',
    PRODUCTION_COOKIE_INSECURE: 'COOKIE_SECURE tiene que ser "true" en producción: la API debe estar detrás de HTTPS',
    PRODUCTION_PROXY_UNTRUSTED: 'TRUST_PROXY_HOPS tiene que ser al menos 1 en producción y coincidir con la cantidad real de proxies confiables',
  },
} as const

/**
 * El `message` de toda respuesta con exito.
 *
 * Estan separados de los errores porque se leen distinto: el de una MUTACION es
 * lo que el operador ve en el toast y confirma que lo que hizo pasó; el de una
 * LECTURA es una etiqueta y la pantalla no tiene por que mostrarla. Los dos van
 * igual, porque el envelope es uno solo y un endpoint sin `message` obligaria al
 * cliente a preguntarse si falta el campo o si vino vacio.
 *
 * Los de mutacion dicen QUE PASO, en pasado y sin signos de admiracion: el
 * operador esta cargando pacientes, no ganando un premio.
 */
export const SUCCESS_MESSAGES = {
  AUTH: {
    LOGIN: 'Sesión iniciada',
    LOGOUT: 'Sesión cerrada',
    REFRESHED: 'Sesión renovada',
    CURRENT_USER: 'Usuario actual',
  },
  PATIENT: {
    CREATED: 'Paciente creado',
    UPDATED: 'Paciente actualizado',
    DEACTIVATED: 'Paciente dado de baja',
    DETAIL: 'Ficha del paciente',
    LIST: 'Listado de pacientes',
    AFFILIATION_LOOKUP: 'Resultado de la búsqueda por afiliación',
    READMISSION_DRAFT: 'Borrador de reingreso',
    INSURANCE_PROVIDER_CHANGED: 'Cambio de obra social registrado',
  },
  EPISODE: {
    OPENED: 'Episodio abierto',
    CLOSED: 'Episodio cerrado',
  },
  CARE_SERVICE: {
    CREATED: 'Prestación agregada',
    PROFESSIONAL_ASSIGNED: 'Profesional actualizado',
    ENDED: 'Prestación dada de baja',
  },
  AUTHORIZATION: {
    LIST: 'Autorizaciones de la prestación',
    CREATED: 'Autorización registrada',
    CLAIMED: 'Reclamo registrado',
  },
  DASHBOARD: {
    SUMMARY: 'Resumen del día',
  },
  CATALOG: {
    INSURANCE_PROVIDERS: 'Obras sociales',
    CONTRACTING_COMPANIES: 'Empresas contratantes',
    SPECIALTIES: 'Especialidades',
    FREQUENCIES: 'Frecuencias',
    PROFESSIONALS: 'Profesionales',
    PROVINCES: 'Provincias',
    LOCALITIES: 'Localidades',
  },
  /**
   * Administracion (D14). Nada se borra: se desactiva, y el mensaje lo dice.
   */
  ADMIN: {
    SPECIALTY_CREATED: 'Especialidad creada',
    SPECIALTY_UPDATED: 'Especialidad actualizada',
    SPECIALTY_FREQUENCIES_SET: 'Frecuencias habilitadas para la especialidad',
    FREQUENCY_CREATED: 'Frecuencia creada',
    PROFESSIONAL_CREATED: 'Profesional creado',
    PROFESSIONAL_UPDATED: 'Profesional actualizado',
    PROFESSIONAL_SPECIALTIES_SET: 'Especialidades del profesional actualizadas',
    CONTRACTING_COMPANY_CREATED: 'Empresa contratante creada',
    COMPANY_PROVIDERS_SET: 'Convenio actualizado',
    INSURANCE_PROVIDER_CREATED: 'Obra social creada',
    USER_CREATED: 'Usuario creado',
    USERS: 'Usuarios',
  },
} as const
