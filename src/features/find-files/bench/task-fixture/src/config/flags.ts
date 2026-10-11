// Feature flags, read once at start-up. Set FLAG_<NAME>=1 to turn one on.
const on = (name: string) => process.env[`FLAG_${name}`] === '1'

export const flags = {
  newCheckout: on('NEW_CHECKOUT'),
  cashRounding: on('CASH_ROUNDING'),
  dunningEmails: on('DUNNING_EMAILS'),
}
