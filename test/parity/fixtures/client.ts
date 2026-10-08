// Generated from client.json by tools/parity/to_ts.py. Do not edit.
export default {
 "answers": [
  {
   "answer": {
    "noul": 0.7,
    "type": "noul"
   },
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   },
   "result": {
    "noul": 0.7,
    "type": "noul"
   }
  },
  {
   "answer": {
    "noul": 1.2,
    "type": "noul"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "answer": {
    "type": "noul"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "answer": {
    "noul": 0.5,
    "type": "choice"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "answer": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": 0.05
    },
    "type": "choice"
   },
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   },
   "result": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": 0.05
    },
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "b",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": 0.05
    },
    "type": "choice"
   },
   "error": "invalid_response",
   "invariant": "choice_is_argmax",
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.2
    },
    "type": "choice"
   },
   "error": "invalid_response",
   "invariant": "choice_probability_key_set",
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "z",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": 0.05
    },
    "type": "choice"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.3,
     "c": 0.3
    },
    "type": "choice"
   },
   "error": "invalid_response",
   "invariant": "choice_probability_key_set",
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "confidence": 0.869,
    "probabilities": {
     "0": 0.0152,
     "1": 0.1158,
     "2": 0.869
    },
    "score": 1.8538,
    "type": "score"
   },
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "confidence": 0.869,
    "probabilities": {
     "0": 0.0152,
     "1": 0.1158,
     "2": 0.869
    },
    "score": 1.8538,
    "spread_reported": true,
    "type": "score"
   }
  },
  {
   "answer": {
    "confidence": 0.5,
    "score": 1.2,
    "type": "score"
   },
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "confidence": 0.5,
    "probabilities": {},
    "score": 1.2,
    "spread_reported": false,
    "type": "score"
   }
  },
  {
   "answer": {
    "probabilities": {
     "0": 0.2,
     "1": 0.6,
     "2": 0.2
    },
    "score": 0.3,
    "type": "score"
   },
   "error": "invalid_response",
   "invariant": "score_matches_its_distribution",
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "probabilities": {
     "0": 0.1,
     "1": 0.1,
     "2": 0.8
    },
    "score": 3.0,
    "type": "score"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "legend": {
     "0": "low",
     "1": "mid"
    },
    "probabilities": {
     "0": 0.2,
     "1": 0.6,
     "2": 0.2
    },
    "score": 1.0,
    "type": "score"
   },
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "confidence": 1.0,
    "legend": {
     "0": "low",
     "1": "mid"
    },
    "probabilities": {
     "0": 0.2,
     "1": 0.6,
     "2": 0.2
    },
    "score": 1.0,
    "spread_reported": true,
    "type": "score"
   }
  },
  {
   "answer": {
    "noul": true,
    "type": "noul"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "answer": {
    "noul": -5e-07,
    "type": "noul"
   },
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   },
   "result": {
    "noul": 0.0,
    "type": "noul"
   }
  },
  {
   "answer": {
    "noul": 1.0000005,
    "type": "noul"
   },
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   },
   "result": {
    "noul": 1.0,
    "type": "noul"
   }
  },
  {
   "answer": {
    "noul": "0.5",
    "type": "noul"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "answer": null,
   "error": "malformed",
   "invariant": null,
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "answer": [
    1
   ],
   "error": "malformed",
   "invariant": null,
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "answer": {
    "choice": "a",
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": 0.05
    },
    "type": "choice"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.4999999999,
     "c": 1e-10
    },
    "type": "choice"
   },
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   },
   "result": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.4999999999,
     "c": 1e-10
    },
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "b",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.5,
     "c": 0.0
    },
    "type": "choice"
   },
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   },
   "result": {
    "choice": "b",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.5,
     "c": 0.0
    },
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "b",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.4999999999,
     "c": 1e-10
    },
    "type": "choice"
   },
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   },
   "result": {
    "choice": "b",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.4999999999,
     "c": 1e-10
    },
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "b",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.5,
     "b": 0.49999999,
     "c": 1e-08
    },
    "type": "choice"
   },
   "error": "invalid_response",
   "invariant": "choice_is_argmax",
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": 0.0505
    },
    "type": "choice"
   },
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   },
   "result": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": 0.0505
    },
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": [
     0.8,
     0.2
    ],
    "type": "choice"
   },
   "error": "invalid_response",
   "invariant": "choice_probability_key_set",
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "choice": "a",
    "confidence": 0.8,
    "probabilities": {
     "a": 0.8,
     "b": 0.15,
     "c": "x"
    },
    "type": "choice"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "answer": {
    "probabilities": {
     "0": 0.0,
     "1": 0.0,
     "2": 1.0
    },
    "score": 2.5,
    "type": "score"
   },
   "error": "invalid_response",
   "invariant": "score_matches_its_distribution",
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "score": 2.51,
    "type": "score"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "score": -0.5,
    "type": "score"
   },
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "confidence": 1.0,
    "probabilities": {},
    "score": -0.5,
    "spread_reported": false,
    "type": "score"
   }
  },
  {
   "answer": {
    "score": true,
    "type": "score"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "probabilities": {
     "0": 0.0,
     "1": 1.0,
     "2": 0.0
    },
    "score": 1.02,
    "type": "score"
   },
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "confidence": 1.0,
    "probabilities": {
     "0": 0.0,
     "1": 1.0,
     "2": 0.0
    },
    "score": 1.02,
    "spread_reported": true,
    "type": "score"
   }
  },
  {
   "answer": {
    "probabilities": {
     "0": 0.0,
     "1": 1.0,
     "2": 0.0
    },
    "score": 1.03,
    "type": "score"
   },
   "error": "invalid_response",
   "invariant": "score_matches_its_distribution",
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "probabilities": {
     "0": 0.2,
     "1": 0.6,
     "3": 0.2
    },
    "score": 1.0,
    "type": "score"
   },
   "error": "invalid_response",
   "invariant": "score_distribution_on_rubric",
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "probabilities": {
     "1": 0.6,
     "2": 0.2,
     "x": 0.2
    },
    "score": 1.0,
    "type": "score"
   },
   "error": "invalid_response",
   "invariant": "score_distribution_on_rubric",
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "answer": {
    "probabilities": {},
    "score": 1.0,
    "type": "score"
   },
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "confidence": 1.0,
    "probabilities": {},
    "score": 1.0,
    "spread_reported": false,
    "type": "score"
   }
  },
  {
   "answer": {
    "legend": {
     "0": "low",
     "1": 3,
     "7": "x"
    },
    "probabilities": {
     "0": 0.2,
     "1": 0.6,
     "2": 0.2
    },
    "score": 1.0,
    "type": "score"
   },
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "confidence": 1.0,
    "legend": {
     "0": "low"
    },
    "probabilities": {
     "0": 0.2,
     "1": 0.6,
     "2": 0.2
    },
    "score": 1.0,
    "spread_reported": true,
    "type": "score"
   }
  },
  {
   "answer": {
    "confidence": 1.5,
    "score": 1.0,
    "type": "score"
   },
   "error": "malformed",
   "invariant": null,
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  }
 ],
 "questions": [
  {
   "question": {
    "instructions": "Is it so?",
    "type": "noul"
   },
   "result": {
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "question": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   },
   "result": {
    "criteria": {
     "a": "first",
     "b": "second",
     "c": "third"
    },
    "instructions": "Which?",
    "type": "choice"
   }
  },
  {
   "question": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   },
   "result": {
    "criteria": [
     "low",
     "medium",
     "high"
    ],
    "instructions": "How much?",
    "type": "score"
   }
  },
  {
   "error": "question \"q\": criteria for a choice must be an object of 2 to 255 options, {\"option\": \"what it means\"}",
   "question": {
    "criteria": {
     "only": "one"
    },
    "instructions": "x",
    "type": "choice"
   }
  },
  {
   "error": "question \"q\" asks nothing: its instructions only repeat its own name. The id names the question, \"instructions\" asks it",
   "question": {
    "criteria": [
     "a"
    ],
    "instructions": "q",
    "type": "score"
   }
  },
  {
   "error": "question \"q\" has unknown type \"maybe\"; use one of choice, score, noul",
   "question": {
    "instructions": "q",
    "type": "maybe"
   }
  },
  {
   "error": "question \"q\" asks nothing: its instructions only repeat its own name. The id names the question, \"instructions\" asks it",
   "question": {
    "instructions": "q",
    "type": "noul"
   }
  },
  {
   "question": {
    "criteria": {
     "true": "y"
    },
    "instructions": "Is it so?",
    "type": "noul"
   },
   "result": {
    "criteria": {
     "true": "y"
    },
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "error": "question \"q\" is a noul: its criteria, if any, must be {\"true\": \"what a yes means\", \"false\": \"what a no means\"}; anything else would be sent and never read",
   "question": {
    "criteria": {
     "yes": "y"
    },
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "error": "question \"q\" has no instructions: the text of the question, as a string (or a non-empty object or array holding it)",
   "question": {
    "instructions": "  ",
    "type": "noul"
   }
  },
  {
   "question": {
    "instructions": {
     "ask": "Is it so?"
    },
    "type": "noul"
   },
   "result": {
    "instructions": {
     "ask": "Is it so?"
    },
    "type": "noul"
   }
  },
  {
   "error": "question \"q\" has no instructions: the text of the question, as a string (or a non-empty object or array holding it)",
   "question": {
    "instructions": [],
    "type": "noul"
   }
  },
  {
   "error": "question \"q\": the noul criterion \"true\" is empty",
   "question": {
    "criteria": {
     "true": ""
    },
    "instructions": "Is it so?",
    "type": "noul"
   }
  },
  {
   "error": "question \"q\": 256 options; a choice takes at most 255. Pick a group first, then a member",
   "question": {
    "criteria": {
     "0": "x",
     "1": "x",
     "10": "x",
     "100": "x",
     "101": "x",
     "102": "x",
     "103": "x",
     "104": "x",
     "105": "x",
     "106": "x",
     "107": "x",
     "108": "x",
     "109": "x",
     "11": "x",
     "110": "x",
     "111": "x",
     "112": "x",
     "113": "x",
     "114": "x",
     "115": "x",
     "116": "x",
     "117": "x",
     "118": "x",
     "119": "x",
     "12": "x",
     "120": "x",
     "121": "x",
     "122": "x",
     "123": "x",
     "124": "x",
     "125": "x",
     "126": "x",
     "127": "x",
     "128": "x",
     "129": "x",
     "13": "x",
     "130": "x",
     "131": "x",
     "132": "x",
     "133": "x",
     "134": "x",
     "135": "x",
     "136": "x",
     "137": "x",
     "138": "x",
     "139": "x",
     "14": "x",
     "140": "x",
     "141": "x",
     "142": "x",
     "143": "x",
     "144": "x",
     "145": "x",
     "146": "x",
     "147": "x",
     "148": "x",
     "149": "x",
     "15": "x",
     "150": "x",
     "151": "x",
     "152": "x",
     "153": "x",
     "154": "x",
     "155": "x",
     "156": "x",
     "157": "x",
     "158": "x",
     "159": "x",
     "16": "x",
     "160": "x",
     "161": "x",
     "162": "x",
     "163": "x",
     "164": "x",
     "165": "x",
     "166": "x",
     "167": "x",
     "168": "x",
     "169": "x",
     "17": "x",
     "170": "x",
     "171": "x",
     "172": "x",
     "173": "x",
     "174": "x",
     "175": "x",
     "176": "x",
     "177": "x",
     "178": "x",
     "179": "x",
     "18": "x",
     "180": "x",
     "181": "x",
     "182": "x",
     "183": "x",
     "184": "x",
     "185": "x",
     "186": "x",
     "187": "x",
     "188": "x",
     "189": "x",
     "19": "x",
     "190": "x",
     "191": "x",
     "192": "x",
     "193": "x",
     "194": "x",
     "195": "x",
     "196": "x",
     "197": "x",
     "198": "x",
     "199": "x",
     "2": "x",
     "20": "x",
     "200": "x",
     "201": "x",
     "202": "x",
     "203": "x",
     "204": "x",
     "205": "x",
     "206": "x",
     "207": "x",
     "208": "x",
     "209": "x",
     "21": "x",
     "210": "x",
     "211": "x",
     "212": "x",
     "213": "x",
     "214": "x",
     "215": "x",
     "216": "x",
     "217": "x",
     "218": "x",
     "219": "x",
     "22": "x",
     "220": "x",
     "221": "x",
     "222": "x",
     "223": "x",
     "224": "x",
     "225": "x",
     "226": "x",
     "227": "x",
     "228": "x",
     "229": "x",
     "23": "x",
     "230": "x",
     "231": "x",
     "232": "x",
     "233": "x",
     "234": "x",
     "235": "x",
     "236": "x",
     "237": "x",
     "238": "x",
     "239": "x",
     "24": "x",
     "240": "x",
     "241": "x",
     "242": "x",
     "243": "x",
     "244": "x",
     "245": "x",
     "246": "x",
     "247": "x",
     "248": "x",
     "249": "x",
     "25": "x",
     "250": "x",
     "251": "x",
     "252": "x",
     "253": "x",
     "254": "x",
     "255": "x",
     "26": "x",
     "27": "x",
     "28": "x",
     "29": "x",
     "3": "x",
     "30": "x",
     "31": "x",
     "32": "x",
     "33": "x",
     "34": "x",
     "35": "x",
     "36": "x",
     "37": "x",
     "38": "x",
     "39": "x",
     "4": "x",
     "40": "x",
     "41": "x",
     "42": "x",
     "43": "x",
     "44": "x",
     "45": "x",
     "46": "x",
     "47": "x",
     "48": "x",
     "49": "x",
     "5": "x",
     "50": "x",
     "51": "x",
     "52": "x",
     "53": "x",
     "54": "x",
     "55": "x",
     "56": "x",
     "57": "x",
     "58": "x",
     "59": "x",
     "6": "x",
     "60": "x",
     "61": "x",
     "62": "x",
     "63": "x",
     "64": "x",
     "65": "x",
     "66": "x",
     "67": "x",
     "68": "x",
     "69": "x",
     "7": "x",
     "70": "x",
     "71": "x",
     "72": "x",
     "73": "x",
     "74": "x",
     "75": "x",
     "76": "x",
     "77": "x",
     "78": "x",
     "79": "x",
     "8": "x",
     "80": "x",
     "81": "x",
     "82": "x",
     "83": "x",
     "84": "x",
     "85": "x",
     "86": "x",
     "87": "x",
     "88": "x",
     "89": "x",
     "9": "x",
     "90": "x",
     "91": "x",
     "92": "x",
     "93": "x",
     "94": "x",
     "95": "x",
     "96": "x",
     "97": "x",
     "98": "x",
     "99": "x"
    },
    "instructions": "Pick",
    "type": "choice"
   }
  },
  {
   "error": "question \"q\": criteria for a choice must be an object of 2 to 255 options, {\"option\": \"what it means\"}",
   "question": {
    "criteria": [
     "a",
     "b"
    ],
    "instructions": "Pick",
    "type": "choice"
   }
  },
  {
   "error": "question \"q\": 11 levels; a score takes at most 10",
   "question": {
    "criteria": [
     "0",
     "1",
     "2",
     "3",
     "4",
     "5",
     "6",
     "7",
     "8",
     "9",
     "10"
    ],
    "instructions": "Rate",
    "type": "score"
   }
  },
  {
   "error": "question \"q\": score level 1 is empty",
   "question": {
    "criteria": [
     "a",
     "  "
    ],
    "instructions": "Rate",
    "type": "score"
   }
  },
  {
   "error": "question \"q\": criteria for a score must be a list of 2 to 10 levels, lowest first",
   "question": {
    "criteria": {
     "a": 1,
     "b": 2
    },
    "instructions": "Rate",
    "type": "score"
   }
  },
  {
   "error": "question \"q\": criteria are required for a choice, as an object of 2 to 255 options, {\"option\": \"what it means\"}",
   "question": {
    "instructions": "Pick",
    "type": "choice"
   }
  },
  {
   "error": "question \"q\" has no type; use one of choice, score, noul",
   "question": {
    "instructions": "x"
   }
  },
  {
   "error": "question \"q\" has unknown type 3; use one of choice, score, noul",
   "question": {
    "instructions": "x",
    "type": 3
   }
  },
  {
   "error": "question \"q\" asks nothing: its instructions only repeat its own name. The id names the question, \"instructions\" asks it",
   "question": {
    "criteria": null,
    "instructions": "Q__ ",
    "type": "noul"
   }
  },
  {
   "error": "question \"q\" must be an object like {\"type\": ..., \"instructions\": ...}",
   "question": "not a question"
  },
  {
   "question": {
    "criteria": {
     "true": "y"
    },
    "instructions": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxq",
    "type": "noul"
   },
   "result": {
    "criteria": {
     "true": "y"
    },
    "instructions": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxq",
    "type": "noul"
   }
  }
 ]
}
