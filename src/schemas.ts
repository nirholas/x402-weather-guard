/**
 * Per-route request/response schemas published in the x402 402 challenge.
 *
 * Generated from `openapi.json` so the discovery metadata and the runtime
 * challenge cannot drift apart: `accepts[].outputSchema.input` describes how to
 * call the route, `accepts[].outputSchema.output` describes what the paid 200
 * returns. Keys match the paywall route map in `server.ts` exactly.
 *
 * Update `openapi.json` first, then re-derive this file.
 */

/** x402 Bazaar-style schema pair carried by every accept entry. */
export type RouteSchema = {
  /** How to invoke the route: method, query params and/or JSON body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the paid 200 response body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "GET /forecast": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "lat": {
          "type": "number",
          "description": "Latitude, -90…90.",
          "example": 47.6062
        },
        "lon": {
          "type": "number",
          "description": "Longitude, -180…180.",
          "example": -122.3321
        },
        "hours": {
          "type": "integer",
          "description": "Length of the window in hours, 1–168. Default 24.",
          "example": 6
        },
        "start": {
          "type": "string",
          "description": "ISO-8601 start of the window. Default: now.",
          "example": "2026-08-07T03:00:00Z"
        }
      },
      "queryParamsRequired": [
        "lat",
        "lon"
      ]
    },
    "output": {
      "type": "object",
      "required": [
        "source",
        "location",
        "window",
        "units",
        "hourly",
        "alerts",
        "retrievedAt"
      ],
      "properties": {
        "source": {
          "type": "object",
          "properties": {
            "forecast": {
              "type": "string",
              "enum": [
                "open-meteo"
              ]
            },
            "alerts": {
              "type": "string",
              "enum": [
                "nws"
              ]
            }
          }
        },
        "location": {
          "type": "object",
          "properties": {
            "requested": {
              "type": "object",
              "properties": {
                "latitude": {
                  "type": "number"
                },
                "longitude": {
                  "type": "number"
                }
              }
            },
            "resolved": {
              "type": "object",
              "description": "The grid point Open-Meteo actually used.",
              "properties": {
                "latitude": {
                  "type": "number"
                },
                "longitude": {
                  "type": "number"
                },
                "elevationM": {
                  "type": [
                    "number",
                    "null"
                  ]
                }
              }
            },
            "timezone": {
              "type": "string",
              "enum": [
                "UTC"
              ]
            }
          }
        },
        "window": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string",
              "format": "date-time"
            },
            "end": {
              "type": "string",
              "format": "date-time"
            },
            "hours": {
              "type": "integer"
            }
          }
        },
        "units": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        },
        "hourly": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "time",
              "conditions"
            ],
            "properties": {
              "time": {
                "type": "string",
                "format": "date-time",
                "description": "Top of the hour, UTC."
              },
              "temperatureC": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "feelsLikeC": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "humidityPct": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "precipitationProbabilityPct": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "precipitationMm": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "windKph": {
                "type": [
                  "number",
                  "null"
                ],
                "description": "Sustained wind at 10 m."
              },
              "gustKph": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "cloudCoverPct": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "visibilityM": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "weatherCode": {
                "type": [
                  "integer",
                  "null"
                ],
                "description": "WMO weather code."
              },
              "conditions": {
                "type": "string",
                "description": "The WMO code in plain English."
              }
            }
          }
        },
        "alerts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "event": {
                "type": "string"
              },
              "severity": {
                "type": "string",
                "description": "NWS severity — Extreme, Severe, Moderate, Minor, Unknown."
              },
              "urgency": {
                "type": "string"
              },
              "certainty": {
                "type": "string"
              },
              "onset": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "ends": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "headline": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "areaDesc": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        },
        "alertStatus": {
          "type": "string",
          "description": "`ok`, `ok (no active alerts)`, or `unavailable: <reason>`."
        },
        "retrievedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "POST /decision": {
    "input": {
      "type": "http",
      "method": "POST",
      "bodyType": "json",
      "bodyFields": {
        "lat": {
          "type": "number",
          "minimum": -90,
          "maximum": 90
        },
        "lon": {
          "type": "number",
          "minimum": -180,
          "maximum": 180
        },
        "start": {
          "type": "string",
          "format": "date-time"
        },
        "end": {
          "type": "string",
          "format": "date-time"
        },
        "activity": {
          "type": "string",
          "enum": [
            "outdoor-event",
            "drone-flight",
            "cycling",
            "construction",
            "photography",
            "generic"
          ],
          "default": "outdoor-event"
        },
        "thresholds": {
          "type": "object",
          "description": "Per-field overrides on top of the chosen profile.",
          "properties": {
            "maxPrecipProbabilityPct": {
              "type": "number"
            },
            "maxPrecipMm": {
              "type": "number"
            },
            "maxWindKph": {
              "type": "number"
            },
            "maxGustKph": {
              "type": "number"
            },
            "minTempC": {
              "type": "number"
            },
            "maxTempC": {
              "type": "number"
            },
            "minVisibilityM": {
              "type": "number"
            }
          }
        },
        "lookaheadHours": {
          "type": "integer",
          "minimum": 1,
          "maximum": 160,
          "default": 48
        }
      },
      "bodyFieldsRequired": [
        "lat",
        "lon"
      ]
    },
    "output": {
      "type": "object",
      "required": [
        "verdict",
        "summary",
        "confidence",
        "activity",
        "thresholds",
        "window",
        "reasoning",
        "alternativeWindows",
        "retrievedAt"
      ],
      "properties": {
        "verdict": {
          "type": "string",
          "enum": [
            "go",
            "risky",
            "no-go"
          ]
        },
        "summary": {
          "type": "string",
          "description": "One sentence you can hand to a human."
        },
        "confidence": {
          "type": "number",
          "description": "0–1. Falls with forecast lead time and with how close the call was."
        },
        "activity": {
          "type": "string"
        },
        "thresholds": {
          "type": "object",
          "description": "The exact bar this verdict was measured against.",
          "additionalProperties": {
            "type": "number"
          }
        },
        "location": {
          "type": "object",
          "additionalProperties": true
        },
        "window": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string",
              "format": "date-time"
            },
            "end": {
              "type": "string",
              "format": "date-time"
            },
            "hours": {
              "type": "integer"
            }
          }
        },
        "reasoning": {
          "type": "array",
          "description": "Every threshold breach in the window. Empty on a clean `go`.",
          "items": {
            "type": "object",
            "properties": {
              "factor": {
                "type": "string",
                "enum": [
                  "precipitationProbability",
                  "precipitation",
                  "wind",
                  "gusts",
                  "temperature",
                  "visibility",
                  "conditions"
                ]
              },
              "at": {
                "type": "string",
                "format": "date-time"
              },
              "observed": {
                "type": [
                  "string",
                  "number"
                ]
              },
              "limit": {
                "type": [
                  "string",
                  "number"
                ]
              },
              "severity": {
                "type": "string",
                "enum": [
                  "blocking",
                  "marginal"
                ],
                "description": "One `blocking` breach forces a no-go."
              },
              "note": {
                "type": "string"
              }
            }
          }
        },
        "hoursEvaluated": {
          "type": "integer"
        },
        "worstHour": {
          "anyOf": [
            {
              "type": "object",
              "required": [
                "time",
                "conditions"
              ],
              "properties": {
                "time": {
                  "type": "string",
                  "format": "date-time",
                  "description": "Top of the hour, UTC."
                },
                "temperatureC": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "feelsLikeC": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "humidityPct": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "precipitationProbabilityPct": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "precipitationMm": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "windKph": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "description": "Sustained wind at 10 m."
                },
                "gustKph": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "cloudCoverPct": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "visibilityM": {
                  "type": [
                    "number",
                    "null"
                  ]
                },
                "weatherCode": {
                  "type": [
                    "integer",
                    "null"
                  ],
                  "description": "WMO weather code."
                },
                "conditions": {
                  "type": "string",
                  "description": "The WMO code in plain English."
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "alerts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "event": {
                "type": "string"
              },
              "severity": {
                "type": "string",
                "description": "NWS severity — Extreme, Severe, Moderate, Minor, Unknown."
              },
              "urgency": {
                "type": "string"
              },
              "certainty": {
                "type": "string"
              },
              "onset": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "ends": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "headline": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "areaDesc": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        },
        "alertStatus": {
          "type": "string"
        },
        "alternativeWindows": {
          "type": "array",
          "description": "Up to five non-overlapping later windows that would come back `go`.",
          "items": {
            "type": "object",
            "properties": {
              "start": {
                "type": "string",
                "format": "date-time"
              },
              "end": {
                "type": "string",
                "format": "date-time"
              },
              "verdict": {
                "type": "string",
                "enum": [
                  "go"
                ]
              },
              "worstMarginPct": {
                "type": "number",
                "description": "How much headroom the tightest hour has against its threshold."
              },
              "summary": {
                "type": "string"
              }
            }
          }
        },
        "hourly": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "time",
              "conditions"
            ],
            "properties": {
              "time": {
                "type": "string",
                "format": "date-time",
                "description": "Top of the hour, UTC."
              },
              "temperatureC": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "feelsLikeC": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "humidityPct": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "precipitationProbabilityPct": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "precipitationMm": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "windKph": {
                "type": [
                  "number",
                  "null"
                ],
                "description": "Sustained wind at 10 m."
              },
              "gustKph": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "cloudCoverPct": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "visibilityM": {
                "type": [
                  "number",
                  "null"
                ]
              },
              "weatherCode": {
                "type": [
                  "integer",
                  "null"
                ],
                "description": "WMO weather code."
              },
              "conditions": {
                "type": "string",
                "description": "The WMO code in plain English."
              }
            }
          }
        },
        "source": {
          "type": "object",
          "additionalProperties": true
        },
        "retrievedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
};
