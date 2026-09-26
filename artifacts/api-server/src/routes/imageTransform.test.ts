import { describe, expect, it } from "vitest";
import { exactAspectCrop } from "./imageTransform";
import { isSupportedMaster } from "../lib/imageLimits";

describe("exactAspectCrop", () => {
  it("returns centered exact-ratio windows without enlarging", () => {
    expect(exactAspectCrop(2400, 1600, [16, 9])).toEqual({
      left: 0,
      top: 125,
      width: 2400,
      height: 1350,
    });
    expect(exactAspectCrop(1600, 2400, [4, 3])).toEqual({
      left: 0,
      top: 600,
      width: 1600,
      height: 1200,
    });
    expect(exactAspectCrop(800, 1200, [1, 1])).toEqual({
      left: 0,
      top: 200,
      width: 800,
      height: 800,
    });
  });

  it("rejects sources that cannot provide even one exact-ratio pixel unit", () => {
    expect(exactAspectCrop(15, 100, [16, 9])).toBeNull();
  });

  it("caps generated derivatives at 2400px without upscaling", () => {
    expect(exactAspectCrop(6000, 4000, [16, 9])).toEqual({
      left: 1800,
      top: 1325,
      width: 2400,
      height: 1350,
    });
  });
});

describe("retained master safety limit", () => {
  it("rejects compressed images with dangerous decoded dimensions at ingestion and transform", () => {
    expect(isSupportedMaster(6000, 6000)).toBe(false);
    expect(isSupportedMaster(10000, 100)).toBe(false);
    expect(isSupportedMaster(4000, 4000)).toBe(true);
    expect(isSupportedMaster(undefined, 2000)).toBe(false);
  });
});