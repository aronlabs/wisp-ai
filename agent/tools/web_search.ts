import { webSearch } from 'eve/tools/web_search';
// Eve rc.6 only accepts defineTool values from dynamic tool resolvers.
// Native provider tools are filtered in the model adapter instead.
export default webSearch({ provider: 'native' });
