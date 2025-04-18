export interface AspectReleaseInfo {
  version: string;
  bazelVersion: string;
  sha256: string;
}

export const ASPECT_ASSET_NAMES = [
  "kls-aspect-bazel7.zip",
  "kls-aspect-bazel8.zip",
  "kls-aspect-bazel9.zip",
]

export const ASPECT_RELEASE_VERSION = "v0.4.1-rc.1";

export const ASPECT_RELEASES: AspectReleaseInfo[] = [
  {
    bazelVersion: "6",
    version: "v0.4.1-rc.1",
    sha256: "c06759b82267d5c9a5ef12fc280f8463550b15b6440ee24b5b3c93ac6a16f171"
  },
  {
    bazelVersion: "7",
    version: "v0.4.1-rc.1",
    sha256: "e802c9ce51b26ce0c23bea4b9f3826908938f90e835e99296e1df44e3982e123"
  },
  {
    bazelVersion: "8",
    version: "v0.4.1-rc.1",
    sha256: "ba208777915ce10a0d556f54f9afeba8111104f0824cbff7c98a64797633b3ff"
  }
]

export const KLS_RELEASE_ARCHIVE_SHA256: Record<string, string> = {
  "v1.3.14-bazel":
    "39eda21ef69e448ed9738c35993158f797f0817e8d56ff44abbd7c6981197251",
  "v1.3.15-bazel":
    "6fcb725ec0aaecd5dfb14af40e4245f2f9c1c22d1f57bee86f812d0599d5616e",
  "v1.3.16-bazel":
    "ad9912882298cfc8e3e25f7dd16b2c5c1d683fb4d718f42044720388586e0a74",
  "v1.3.17-bazel":
    "e2302bb80902aa47203325268037c0f8793630e80261dca4d00272e61c9cde0f",
  "v1.3.18-bazel":
    "cf8ea6d7f11415957d0bd538d34b7dd199697a7596e6a356b57ec2446331e574",
  "v1.5.0-bazel":
    "2e915df0a75d24ddae168a860c507729246c76b99bebab9ad2f40329963bb5fd",
  "v1.5.1-bazel":
    "10351d04fbcb2f9ef42e55e808a5d10b6d5090e146bf65c698ff47b18f19650d",
  "v1.5.2-bazel":
    "25cf3f238c0948832726867477de4b145d017467f4184e2384532ecc8ef8d169",
  "v1.5.3-bazel":
    "2d6f765febecb5a9db1c0b412a3292fdea5f4457779892bb049af7fda617dfae",
  "v1.6.0-bazel":
    "7617d38bc08ea2a4c92df5626e1b89ffaabedccc9276fc2e6f6ee0507f8fb730",
  "v1.6.1-bazel":
    "91f4a08d0f76209c3e314d995c80be360bde0e2489e18de2c329cba6a5e58efd",
  "v1.6.2-bazel":
    "83806ddb50b19cbd24ba55a82a74da421ff40593c984036cfbfb7a9d37347051",
  "v1.6.3-bazel":
    "972023ba65a9ac321232ba60233b9e88c8b5c7cf18a976b0e102993d9aedcdbb",
};
