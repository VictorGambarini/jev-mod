"""A small CSV line parser: commas, quoted fields, and "" for a quote inside a quoted field."""


def parse_line(line):
    fields = []
    field = []
    quoted = False
    for ch in line:
        if quoted:
            if ch == '"':
                quoted = False
            else:
                field.append(ch)
        elif ch == '"':
            quoted = True
        elif ch == ",":
            fields.append("".join(field))
            field = []
        else:
            field.append(ch)
    fields.append("".join(field))
    return fields
