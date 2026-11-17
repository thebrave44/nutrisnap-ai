import sys, struct

def read_wasm_memory_flags(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'\x00asm', 'not wasm'
    pos = 8
    results = []
    while pos < len(data):
        sec_id = data[pos]; pos += 1
        # read LEB128 size
        size = 0; shift = 0
        while True:
            b = data[pos]; pos += 1
            size |= (b & 0x7f) << shift
            if not (b & 0x80): break
            shift += 7
        if sec_id == 5:  # memory section
            count = data[pos]; p = pos + 1
            # LEB count
            cnt = 0; shift = 0
            while True:
                b = data[p]; p += 1
                cnt |= (b & 0x7f) << shift
                if not (b & 0x80): break
                shift += 7
            for i in range(cnt):
                flags = data[p]; p += 1
                results.append(flags)
                # skip limits
                if flags & 0x01:
                    # max present
                    while True:
                        b = data[p]; p += 1
                        if not (b & 0x80): break
                    while True:
                        b = data[p]; p += 1
                        if not (b & 0x80): break
                else:
                    while True:
                        b = data[p]; p += 1
                        if not (b & 0x80): break
            break
        pos += size
    return results

for path in sys.argv[1:]:
    flags = read_wasm_memory_flags(path)
    shared = any(f & 0x02 or f & 0x03 for f in flags)
    print(path.split('/')[-1], 'memory flags:', flags, 'SHARED' if shared else 'not-shared')
