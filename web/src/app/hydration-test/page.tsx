"use client";
import { useState } from "react";

export default function HydrationTest() {
  const [n, setN] = useState(0);
  return (
    <button id="probe" onClick={() => setN((x) => x + 1)}>
      clicked {n}
    </button>
  );
}
