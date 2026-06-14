export type ArtStyleId =
    | 'surprise'
    | 'watercolor'
    | 'colored-pencil'
    | 'storybook-painterly'
    | 'graphic-novel'
    | '3d-animated';

export interface ArtStyleOption {
    readonly id: ArtStyleId;
    readonly label: string;
    /** Concrete prompt-ready descriptor. Undefined for `surprise`, where the LLM picks. */
    readonly descriptor?: string;
}

export const ART_STYLE_OPTIONS: readonly ArtStyleOption[] = [
    { id: 'surprise', label: 'Surprise Me' },
    {
        id: 'watercolor',
        label: 'Watercolor',
        descriptor: 'soft watercolor illustration with loose brushstrokes, gentle washes of color, and visible paper texture',
    },
    {
        id: 'colored-pencil',
        label: 'Colored Pencil Sketch',
        descriptor: 'colored pencil sketch with visible pencil strokes, layered hatching, soft shading, and a textured paper feel',
    },
    {
        id: 'storybook-painterly',
        label: 'Storybook Painterly',
        descriptor: 'classic storybook painterly illustration with rich brushwork, warm lighting, soft edges, and gouache-style depth',
    },
    {
        id: 'graphic-novel',
        label: 'Graphic Novel',
        descriptor: 'graphic novel illustration with bold inked outlines, dynamic shadows, halftone shading, and saturated comic-style colors',
    },
    {
        id: '3d-animated',
        label: '3D Animated',
        descriptor: 'modern 3D animated film style with rendered volumes, expressive lighting, subsurface skin/fur shading, and stylized character proportions',
    },
];

export const FIERCE_MODE_DESCRIPTOR =
    "Render the animals with children's-book-appropriate intensity: powerful posture, alert and focused expression, dynamic energy, and a dramatic but safe presence. No gore, no injury, no blood, no horror, no realistic violence — keep it suitable for a children's educational book.";

export interface StoryGeneratorOptions {
    readonly artStyle: ArtStyleId;
    readonly fierceMode: boolean;
}

export function getArtStyleDescriptor(id: ArtStyleId): string | undefined {
    return ART_STYLE_OPTIONS.find((o) => o.id === id)?.descriptor;
}
