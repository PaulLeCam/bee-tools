import test_cases from './test_cases.ts'
import { assertEquals, test } from './test_deps.ts'

import { BMTHasher } from '../bmt_hasher.ts'
import { CHUNK_SIZE } from '../constants.ts'

test({
  name: 'BMTHasher - manual write',
  fn() {
    const bmt = new BMTHasher(31)
    const data = new Uint8Array(new Array(31).fill(0).map((_, i) => i))
    const hash = bmt.update(data).toString()
    assertEquals(
      hash,
      'ece86edb20669cc60d142789d464d57bdf5e33cb789d443f608cbd81cfa5697d',
    )
  },
})

for (const { length, hash } of test_cases.slice(0, 7)) {
  test({
    name: `BMTHasher - length ${length}`,
    fn() {
      const bmt = new BMTHasher(length)
      const data = new ArrayBuffer(length)
      const view = new DataView(data)
      for (let i = 0; i < length; i++) {
        view.setUint8(i, i % 255)
      }
      for (let i = 0; i < length; i += CHUNK_SIZE) {
        let l = CHUNK_SIZE
        if (length - i < CHUNK_SIZE) {
          l = length - i
        }
        bmt.update(data.slice(i, l))
      }
      assertEquals(bmt.toString(), hash)
    },
  })
}
