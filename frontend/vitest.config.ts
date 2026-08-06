import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom, not node: JSZip reads Blob/File input through FileReader, which
    // only exists in a browser-like environment. Testing under node would
    // silently exercise a different code path from the one users hit.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
