import components from 'prismjs/components.js';
import getLoader from 'prismjs/dependencies';

interface ILangLoadStatus {
    lang: string;
    status: 'noexist' | 'cached' | 'loaded';
}

export const loadedLanguages = new Set([
    'markup',
    'css',
    'clike',
    'javascript',
]);

const { languages } = components;
const loadingComponents = new Map<string, Promise<void>>();

// Look for the origin language by alias
export function transformAliasToOrigin(langs: string[]) {
    const result = [];

    for (const lang of langs) {
        if (languages[lang]) {
            result.push(lang);
        }
        else {
            const language = Object.keys(languages).find((name) => {
                const l = languages[name];
                if (l.alias) {
                    return (
                        l.alias === lang
                        || (Array.isArray(l.alias) && l.alias.includes(lang))
                    );
                }

                return false;
            });

            if (language) {
                result.push(language);
            }
            else {
                result.push(lang);
            }
        }
    }

    return result;
}

function loadPrismComponent(lang: string): Promise<void> {
    const pending = loadingComponents.get(lang);
    if (pending) return pending;

    const promise = new Promise<void>((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error(`Cannot load Prism language ${lang} outside a browser.`));
            return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = new URL(`prism-${lang}.js`, document.baseURI).href;
        script.dataset.prismLanguage = lang;
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => {
            reject(new Error(`Unable to load Prism language ${lang}.`));
        }, { once: true });
        document.head.append(script);
    }).finally(() => {
        loadingComponents.delete(lang);
    });

    loadingComponents.set(lang, promise);
    return promise;
}

function initLoadLanguage(Prism: any) {
    return async function loadLanguages(langs?: string[] | string) {
        if (!langs)
            langs = Object.keys(languages).filter(lang => lang !== 'meta');

        if (langs && !langs.length) {
            return Promise.reject(
                new Error(
                    'The first parameter should be a list of load languages or single language.',
                ),
            );
        }

        if (!Array.isArray(langs))
            langs = [langs];

        const statusPromises: Promise<ILangLoadStatus>[] = [];
        const loaded = [...loadedLanguages, ...Object.keys(Prism.languages)];
        const execution = getLoader(components, langs, loaded).load(
            (lang: string) => {
                const status = (async (): Promise<ILangLoadStatus> => {
                    if (!(lang in components.languages)) {
                        return { lang, status: 'noexist' };
                    }
                    if (loadedLanguages.has(lang) || lang in Prism.languages) {
                        return { lang, status: 'cached' };
                    }

                    delete Prism.languages[lang];
                    await loadPrismComponent(lang);
                    if (!(lang in Prism.languages)) {
                        throw new Error(`Prism language ${lang} did not register itself.`);
                    }
                    loadedLanguages.add(lang);
                    return { lang, status: 'loaded' };
                })();
                statusPromises.push(status);
                return status;
            },
            {
                series: async (before: Promise<unknown>, after: () => Promise<ILangLoadStatus>) => {
                    await before;
                    return after();
                },
                parallel: async (values: Array<Promise<unknown>>) => Promise.all(values),
            },
        );

        await execution;
        return Promise.all(statusPromises);
    };
}

export default initLoadLanguage;
