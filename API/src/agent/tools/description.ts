import { z } from 'zod'

export const DESCRIPTION_MAX = 80









export const toolDescription = z
  .string()
  .min(1)
  .max(DESCRIPTION_MAX)
  .describe(
    'What this particular call is for, shown to the user in place of the tool name. ' +
      'Three to six words, sentence case, present participle, no trailing period. ' +
      'Describe the goal, not the mechanism: "Converting pixels to megapixels", ' +
      '"Checking the 2019 revenue figure", "Comparing the two death tolls". ' +
      'Not "Running the calculator", not "Calling web_search".'
  )
