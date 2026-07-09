"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AddWebsiteForm() {
  const [websiteName, setWebsiteName] = useState("");
  const [domain, setDomain] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase
      .from("websites")
      .insert({
        website_name: websiteName,
        domain: domain,
      });

    if (error) {
      alert(error.message);
      return;
    }

    setWebsiteName("");
    setDomain("");

    //window.location.reload();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border p-4 rounded-lg mb-6"
    >
      <h2 className="text-xl font-bold mb-4">
        Add Website
      </h2>

      <input
        className="border p-2 w-full mb-3"
        placeholder="Website Name"
        value={websiteName}
        onChange={(e) => setWebsiteName(e.target.value)}
      />

      <input
        className="border p-2 w-full mb-3"
        placeholder="Domain"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
      />

      <button
        type="submit"
        className="bg-black text-white px-4 py-2 rounded"
      >
        Add Website
      </button>
    </form>
  );
}