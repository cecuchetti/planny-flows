/*
 * Préstamos is a view of the project, not an app of its own, so there is no
 * `loanNavigation` here any more: the host sidebar carries the navigation and
 * `loanCopy` labels the page and the sub-views linked from it.
 */
export const loanCopy = {
  title: 'Préstamos',
  subtitle: 'Préstamos, personas y pagos, dentro del mismo tablero.',
  loans: 'Préstamos',
  borrowers: 'Personas',
  newLoan: 'Nuevo Préstamo',
};

export const borrowerCopy = {
  title: 'Personas',
  search: 'Buscá por nombre o apellido',
  pickerSearch: 'Buscá una persona',
  create: 'Crear persona',
  save: 'Guardar persona',
  add: 'Agregar persona',
  edit: 'Editar',
  empty: 'Todavía no hay personas cargadas.',
  noMatches: 'No encontramos coincidencias.',
  loadError: 'No pudimos cargar las personas. Intentá de nuevo.',
  retry: 'Reintentar',
  loading: 'Cargando personas…',
  required: 'Este campo es obligatorio.',
  cancel: 'Cancelar',
  created: 'Persona creada.',
  updated: 'Persona actualizada.',
  removed: 'Persona eliminada.',
  removeTitle: '¿Eliminar persona?',
  removeMessage: 'Esta acción no se puede deshacer.',
  remove: 'Eliminar',
  firstName: 'Nombre',
  lastName: 'Apellido',
  email: 'Email',
  phone: 'Teléfono',
  address: 'Domicilio',
  nationalId: 'DNI / documento',
  notes: 'Notas',
  loanCount: 'Préstamos',
};

export const loanFormCopy = {
  createTitle: 'Nuevo Préstamo',
  editTitle: 'Editar Préstamo',
  picker: 'Persona',
  amount: 'Monto',
  currency: 'Moneda',
  date: 'Fecha',
  concept: 'Concepto',
  lender: 'Prestamista',
  city: 'Ciudad',
  advancePaid: 'Pago adelantado',
  installmentAmount: 'Valor de la cuota',
  installmentOptional: 'Opcional',
  balancePreview: 'Saldo pendiente',
  save: 'Guardar préstamo',
  saveChanges: 'Guardar cambios',
  saving: 'Guardando…',
  loading: 'Cargando préstamo…',
  loadError: 'No pudimos cargar el préstamo. Intentá de nuevo.',
  retry: 'Reintentar',
  backToList: 'Volver a Préstamos',
  created: 'Préstamo registrado.',
  updated: 'Préstamo actualizado.',
  removed: 'Préstamo eliminado.',
  emptyPicker: 'Elegí una persona para continuar.',
  required: 'Este campo es obligatorio.',
  /*
   * A closed loan keeps only its descriptive fields editable: the amount, the
   * advance-paid and the currency require reopening first, and the form says so
   * instead of leaving a greyed-out field with no reason.
   */
  statusLabel: 'Estado',
  statusActive: 'Activo',
  statusClosed: 'Cerrado',
  writtenOffLabel: 'Condonación',
  closedNotice:
    'Este préstamo está cerrado. Reabrilo para editar el monto, el pago adelantado o la moneda.',
};

export const paymentsCopy = {
  title: 'Pagos',
  amount: 'Monto del pago',
  amountPlaceholder: '0.00',
  register: 'Registrar pago',
  registering: 'Registrando…',
  registered: 'Pago registrado.',
  reversed: 'Pago revertido.',
  restored: 'Reversión deshecha: el pago vuelve a contar.',
  loading: 'Cargando pagos…',
  loadError: 'No pudimos cargar los pagos. Intentá de nuevo.',
  retry: 'Reintentar',
  empty: 'Todavía no hay pagos registrados.',
  total: 'Total cobrado',
  history: 'Historial de pagos',
  date: 'Fecha',
  /*
   * A reversed payment is never deleted: the row stays and carries this label
   * next to its amount, because a receipt issued later has to be able to name it.
   */
  reversedTag: 'Revertido',
  reverse: 'Revertir',
  reverseTitle: '¿Revertir el pago?',
  reverseMessage:
    'El pago queda registrado como revertido y deja de contar para el saldo. Podés deshacer la reversión.',
  undoReversal: 'Deshacer',
  undoTitle: '¿Deshacer la reversión?',
  undoMessage: 'El pago vuelve a contar para el saldo. Podés revertirlo otra vez.',
  currencyLocked:
    'No podés cambiar la moneda: el préstamo ya tiene pago adelantado o pagos registrados.',
};

export const loansListCopy = {
  title: 'Préstamos',
  empty: 'Todavía no hay préstamos. Cargá el primero.',
  loading: 'Cargando préstamos…',
  loadError: 'No pudimos cargar los préstamos. Intentá de nuevo.',
  retry: 'Reintentar',
  newLoan: 'Nuevo préstamo',
  edit: 'Editar',
  remove: 'Eliminar',
  removeTitle: '¿Eliminar préstamo?',
  removeMessage: 'Se elimina el préstamo y sus pagos asociados. No se puede deshacer.',
  borrower: 'Persona',
  balance: 'Saldo pendiente',
  installment: 'Cuota',
  concept: 'Concepto',
  lender: 'Prestamista',
  city: 'Ciudad',
  date: 'Fecha',
  number: 'Nº',
  /*
   * The Activos/Cerrados split: active loans expanded, closed ones collapsed by
   * default and ordered most-recently-closed first, each section with its own
   * count and empty state.
   */
  activeTitle: 'Activos',
  closedTitle: 'Cerrados',
  activeEmpty: 'No hay préstamos activos.',
  closedEmpty: 'No hay préstamos cerrados.',
  expand: 'Mostrar',
  collapse: 'Ocultar',
  close: 'Cerrar',
  closeTitle: '¿Cerrar préstamo?',
  closeMessage: (amount) =>
    `Se condonará el saldo pendiente de ${amount}. El préstamo quedará cerrado.`,
  closePaidMessage: 'No hay saldo pendiente por condonar. El préstamo quedará cerrado.',
  reopen: 'Reabrir',
  reopenTitle: '¿Reabrir préstamo?',
  reopenMessage: 'El préstamo volverá a estar activo y se limpiará la condonación.',
  closedToast: 'Préstamo cerrado.',
  reopenedToast: 'Préstamo reabierto.',
  closedAt: 'Cerrado el',
  writtenOff: 'Condonación',
};
