export type Team = {
  id: string
  name: string
  leadId: string | null
}

export type NewTeam = Omit<Team, 'id'>
