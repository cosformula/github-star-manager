import { getMockCategorizationResponse, getMockListSuggestionResponse, mockSuggestedLists } from "./fixtures";
import type { StarredRepo } from "../../src/types";

// Parse repos from the prompt (simplified extraction)
function extractReposFromPrompt(prompt: string): StarredRepo[] {
  // This is a simplified extraction - in real scenario the prompt format matters
  // For testing, we'll return mock categorization based on prompt content
  return [];
}

// Create mock fetch for OpenRouter API
export function createOpenRouterFetchMock() {
  return async (url: string, options?: RequestInit): Promise<Response> => {
    if (!url.includes("openrouter.ai")) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    const body = JSON.parse(options?.body as string);
    const messages = body.messages as Array<{ role: string; content: string }>;
    const prompt = messages[0]?.content || "";

    let responseContent: string;

    // Detect prompt type and return appropriate response
    if (prompt.includes("suggest") && prompt.includes("list") && prompt.includes("categor")) {
      // List suggestion prompt
      responseContent = getMockListSuggestionResponse();
    } else if (prompt.includes("categorize") || prompt.includes("classify")) {
      // Categorization prompt - generate mock categorization
      // Extract repo names from prompt (simplified)
      const repoMatches = prompt.match(/[\w-]+\/[\w.-]+/g) || [];

      const categorization = repoMatches.map((fullName) => {
        // Simple categorization based on repo name patterns
        let list = "Developer Tools";
        const nameLower = fullName.toLowerCase();

        if (nameLower.includes("react") || nameLower.includes("vue") || nameLower.includes("tailwind") || nameLower.includes("next")) {
          list = "Frontend Frameworks";
        } else if (nameLower.includes("pytorch") || nameLower.includes("transformers") || nameLower.includes("langchain")) {
          list = "AI & Machine Learning";
        } else if (nameLower.includes("express") || nameLower.includes("prisma")) {
          list = "Backend & Database";
        } else if (nameLower.includes("rust") || nameLower.includes("go") || nameLower.includes("typescript")) {
          list = "Programming Languages";
        } else if (nameLower.includes("docker") || nameLower.includes("kubernetes")) {
          list = "DevOps & Infrastructure";
        } else if (nameLower.includes("vscode") || nameLower.includes("neovim") || nameLower.includes("bun") || nameLower.includes("deno")) {
          list = "Developer Tools";
        }

        // Check for deprecated/archived indicators
        const isDeprecated = nameLower.includes("deprecated") || nameLower.includes("old");

        return {
          repo: fullName,
          action: isDeprecated ? "unstar" : "categorize",
          list: isDeprecated ? undefined : list,
          reason: isDeprecated ? "Repository appears deprecated" : `Categorized as ${list}`,
        };
      });

      responseContent = JSON.stringify({ categorization });
    } else if (prompt.includes("unstar") || prompt.includes("cleanup")) {
      // Unstar analysis prompt
      const repoMatches = prompt.match(/[\w-]+\/[\w.-]+/g) || [];

      const suggestions = repoMatches.map((fullName) => {
        const nameLower = fullName.toLowerCase();
        const shouldUnstar = nameLower.includes("deprecated") || nameLower.includes("old");

        return {
          repo: fullName,
          action: shouldUnstar ? "unstar" : "keep",
          reason: shouldUnstar ? "Repository is deprecated or outdated" : "Repository is still useful",
        };
      });

      responseContent = JSON.stringify({ suggestions });
    } else {
      // Default response
      responseContent = JSON.stringify({ message: "Unknown prompt type" });
    }

    // Return mock response with token usage
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: responseContent,
            },
          },
        ],
        usage: {
          prompt_tokens: Math.floor(prompt.length / 4),
          completion_tokens: Math.floor(responseContent.length / 4),
          total_tokens: Math.floor((prompt.length + responseContent.length) / 4),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };
}
