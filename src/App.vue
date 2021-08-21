<template>
  <div @click="resetSelection" id="container">
    <div id="floatingInput"><input v-on:keyup.enter="sendValue" v-on:keyup.escape="hideInput" v-model="inputValue" style="width:33%;margin-left:33%;" type="text" /></div>
    <button @click="openFolder">Open Folder</button>
    <button @click="showInput('leaf')">📜</button><button @click="showInput('dir')">📂</button><button @click="clickUpdateNode">🔄</button>
    <div v-if="loading">Loading ...</div>
    <vue-tree-list
      ref='tree'
      v-else
      @click="onClick"
      @change-name="onChangeName"
      @delete-node="onDel"
      @add-node="onAddNode"
      @dragstart="dragCallback"
      :model="data"
      v-bind:default-expanded="false"
    >
      <template v-slot:leafNameDisplay="slotProps">
        <span>
          {{ slotProps.model.name }}
        </span>
      </template>
      <span style="display:none" slot="addTreeNodeIcon"></span>
      <span style="display:none" slot="addLeafNodeIcon"></span>
    </vue-tree-list>
  </div>
</template>

<script>
import { VueTreeList, Tree, TreeNode } from 'vue-tree-list'
import { readDir, createDir, writeFile, removeDir, removeFile, renameFile } from '@tauri-apps/api/fs'
import { videoDir, resolve as pathResolve, join as pathJoin } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/api/dialog'

const getPartialNodePath = (node, accum, override) => {
  if (node.parent == null) {
    return accum.reverse().join('/')
  } else {
    accum.push(override == null ? node.name : override)
    return getPartialNodePath(node.parent, accum)
  }
}

const getFullNodePath = (node, override = null) => {
  return getPartialNodePath(node, [], override)
}

const sortAlphabetically = (a, b) => {
  if (a.name.toLowerCase() < b.name.toLowerCase()) return -1
  if (a.name.toLowerCase() > b.name.toLowerCase()) return 1
  return 0
}
const slugify = (text) =>
  text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-') + Date.now().toString()

const getNodeObj = (node) => {
  console.log(node)
  if (node.parent !== null) {
    return node.parent.children.filter(function (el) {
      return el.name === node.name
    })[0]
  }
  if (node.isLeaf) {
    return node.parent
  }
  return node
}

export default {
  components: {
    VueTreeList
  },
  async created () {
    this.rootDir = await videoDir().then(result => result)
    const struct = await readDir(this.rootDir, { recursive: false }).then(result => result)
    this.data = new Tree([])
    this.generateNewTree(struct)
    this.loading = false
  },
  data () {
    return {
      newTree: {},
      data: new Tree([]),
      rootDir: '',
      loading: true,
      inputType: '',
      inputValue: '',
      nodeOldName: undefined,
      renamingNode: null,
      selectedNode: null,
      click: null
    }
  },
  methods: {
    dragCallback (event) {
      console.log(event)
    },
    async clickUpdateNode () {
      await this.updateNode(null, true)
    },
    async updateNode (node = null, deploy = false) {
      if (node === null) {
        if (this.selectedNode === null) {
          node = this.data
        } else {
          node = this.selectedNode
        }
      }
      let path = getFullNodePath(node)
      const nodeObj = getNodeObj(node)
      path = await pathResolve(this.rootDir, path).then(result => result)
      const content = await readDir(path, { recursive: false }).then(result => result)
      if (!nodeObj.children) nodeObj.children = []
      content.forEach(item => {
        const matches = nodeObj.children.filter((el) => {
          return el.name === item.name
        })
        if (matches.length === 0) {
          if (item.children) {
            this.addDir(item, nodeObj)
          } else {
            this.addLeaf(item, nodeObj)
          }
        }
      })
      return node
    },
    onDel (node) {
      const path = getFullNodePath(node)
      if (node.isLeaf) {
        removeFile(this.rootDir + path).then(() => { node.remove() })
      } else {
        removeDir(this.rootDir + path, { recursive: true }).then(() => { node.remove() })
      }
    },
    onChangeName (params) {
      if (this.nodeOldName === undefined && this.renamingNode === null) {
        this.nodeOldName = params.oldName
        this.renamingNode = params.node
      }
      if (params.eventType === 'blur') {
        const nodeNewPath = this.rootDir + getFullNodePath(this.renamingNode, params.newName)
        const nodeOldPath = this.rootDir + getFullNodePath(this.renamingNode, this.nodeOldName)
        renameFile(nodeOldPath, nodeNewPath).then(() => {
          this.nodeOldName = undefined
          this.renamingNode = null
        })
      }
    },
    handleClick (params) {
      return new Promise((resolve, reject) => {
        if (this.click) {
          clearTimeout(this.click)
          resolve({ type: 'double', params: params })
        }
        this.click = setTimeout(() => {
          this.click = undefined
          resolve({ type: 'single', params: params })
        }, 200)
      })
    },
    onClick (params) {
      this.handleClick(params).then((result) => {
        const { type, params } = result
        if (type === 'single') {
          if (this.selectedNode !== null) {
            const elem = document.getElementById(this.selectedNode.id)
            if (elem === null) {
              this.selectedNode = null
            } else {
              elem.classList.toggle('active')
            }
          }
          this.selectedNode = params
          document.getElementById(params.id).classList.toggle('active')
        }
        if (type === 'double') {
          if (!params.isLeaf) {
            this.updateNode(params).then((node) => node.toggle())
          }
        }
      })
    },
    resetSelection (event) {
      const shouldReset = event.target.nodeName !== 'BUTTON'
      if (shouldReset) {
        document.getElementById(this.selectedNode.id).classList.toggle('active')
        this.selectedNode = null
      }
    },
    sortTree (node = null) {
      if (node === null) node = this.data
      node.children.sort((a, b) => sortAlphabetically(a, b))
    },
    openFolder () {
      this.loading = true
      open({ directory: true }).then(result => {
        this.rootDir = result
        readDir(result, { recursive: false }).then(result => {
          this.data = new Tree([])
          this.generateNewTree(result)
          this.sortTree()
          this.loading = false
        })
      })
    },
    sendValue () {
      if (this.inputType === 'dir') {
        this.addRootDir(this.inputValue)
      }
      if (this.inputType === 'leaf') {
        this.addRootLeaf(this.inputValue)
      }
      this.hideInput()
    },
    hideInput () {
      document.getElementById('floatingInput').style.top = '-30px'
    },
    showInput (type) {
      this.inputType = type
      this.inputValue = ''
      document.getElementById('floatingInput').style.top = '0px'
      document.querySelector('#floatingInput > input').focus()
    },
    async addRootDir (value) {
      let path = this.rootDir + value
      let parent = this.selectedNode !== null ? getNodeObj(this.selectedNode) : null
      if (parent.isLeaf) {
        parent = parent.parent
      }
      if (parent !== null) {
        path = await pathJoin(this.rootDir, getFullNodePath(parent)).then(result => result) + '\\' + value
      }
      createDir(path).then((result) => {
        this.addDir({ name: value }, parent)
        if (parent !== null) {
          this.selectedNode.toggle()
        }
      })
    },
    addDir (item, parent = null) {
      var nodeStruct = {
        name: item.name,
        dragDisabled: false,
        isLeaf: false,
        id: slugify(item.name)
      }
      var node = new TreeNode(nodeStruct)
      if (!this.data.children) this.data.children = []
      parent == null ? this.data.addChildren(node) : parent.addChildren(node)
      this.sortTree()
      return node
    },
    async addRootLeaf (value) {
      let path = this.rootDir + value
      let parent = this.selectedNode !== null ? getNodeObj(this.selectedNode) : null
      if (parent !== null && parent.isLeaf) {
        parent = parent.parent
      }
      if (parent !== null) {
        path = await pathJoin(this.rootDir, getFullNodePath(parent)).then(result => result) + '\\' + value
      }
      writeFile({ path: path, contents: '' }).then((result) => {
        this.addLeaf({ name: value }, parent)
        if (parent !== null) {
          this.selectedNode.toggle()
        }
      })
    },
    addLeaf (item, parent = null) {
      var nodeStruct = {
        name: item.name,
        isLeaf: true,
        dragDisabled: false,
        id: slugify(item.name)
      }
      var node = new TreeNode(nodeStruct)
      if (!this.data.children) this.data.children = []
      parent == null ? this.data.addChildren(node) : parent.addChildren(node)
      this.sortTree()
    },
    generateNewTree (folderStruct, parent = null) {
      folderStruct.forEach(item => {
        if (item.children) {
          const node = this.addDir(item, parent)
          node.children = []
          this.generateNewTree(item.children, node)
        } else {
          this.addLeaf(item, parent)
        }
      })
    }
  }
}
</script>

<style lang="scss">
.vtl{
  .vtl-drag-disabled{
    background-color: #d0cfcf;
    &:hover{
      background-color: #d0cfcf;
    }
  }
  .vtl-disabled {
    background-color: #d0cfcf;
  }
}
#container{
  height: 100%;
}
</style>

<style lang="scss" scoped>
  #floatingInput{
    position: absolute;
    top: -30px;
    transition-property: top;
    transition-duration: 0.2s;
    transition-delay: 0.05s;
    left: 0;
    right: 0;
    height: auto;
    background-color: #fff;
    box-shadow: 0px 2px 10px rgba($color: #000000, $alpha: 0.1);
    input{
      height: 20px;
    }
  }
  .icon {
    &:hover {
      cursor: pointer;
    }
  }
  .muted {
    color: gray;
    font-size: 80%;
  }

</style>

<style>
.vtl-node.active{
    border: 1px solid red;
  }
</style>
