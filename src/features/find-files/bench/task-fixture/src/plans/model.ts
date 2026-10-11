export type Plan = {
  id: string
  code: string
  name: string
  monthlyCents: number
  seats: number
}

export type NewPlan = Omit<Plan, 'id'>
