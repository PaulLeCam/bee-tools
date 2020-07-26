import test_cases from './test_cases.ts'
import { assertEquals, test } from './test_deps.ts'

import { BRANCHES, CHUNK_SIZE } from '../constants.ts'
import { FileSplitter } from '../file_splitter.ts'

const LENGTH = CHUNK_SIZE * BRANCHES * BRANCHES + CHUNK_SIZE
const data = new ArrayBuffer(LENGTH)
const view = new DataView(data)
for (let i = 0; i < LENGTH; i++) {
  view.setUint8(i, i % 255)
}

test({
  name: 'FileSplitter - single chunk',
  fn() {
    const splitter = new FileSplitter()
    splitter.update(data.slice(0, CHUNK_SIZE))
    assertEquals(
      splitter.toString(),
      'c10090961e7682a10890c334d759a28426647141213abda93b096b892824d2ef',
    )
  },
})

for (const { length, hash } of test_cases) {
  test({
    name: `FileSplitter - length ${length}`,
    fn() {
      const splitter = new FileSplitter()
      splitter.update(data.slice(0, length))
      assertEquals(splitter.toString(), hash)
    },
  })
}
