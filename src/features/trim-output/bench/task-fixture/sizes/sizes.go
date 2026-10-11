// Package sizes parses human sizes such as "1.5GiB" into bytes.
package sizes

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

var units = map[string]float64{
	"B":   1,
	"KB":  1e3,
	"MB":  1e6,
	"GB":  1e9,
	"TB":  1e12,
	"PB":  1e15,
	"KIB": 1 << 10,
	"MIB": 1 << 20,
	"GIB": 1 << 30,
	"TIB": 1 << 40,
	"PIB": 1 << 40,
}

// Parse returns the number of bytes in s, rounded to the nearest byte.
func Parse(s string) (int64, error) {
	s = strings.TrimSpace(s)
	i := 0
	for i < len(s) && (unicode.IsDigit(rune(s[i])) || s[i] == '.') {
		i++
	}
	if i == 0 {
		return 0, fmt.Errorf("sizes: no number in %q", s)
	}
	n, err := strconv.ParseFloat(s[:i], 64)
	if err != nil {
		return 0, err
	}
	unit := strings.ToUpper(strings.TrimSpace(s[i:]))
	if unit == "" {
		unit = "B"
	}
	mult, ok := units[unit]
	if !ok {
		return 0, fmt.Errorf("sizes: unknown unit %q", unit)
	}
	return int64(n*mult + 0.5), nil
}
